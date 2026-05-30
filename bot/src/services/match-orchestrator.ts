import {
  Client,
  TextChannel,
  ChannelType,
  VoiceChannel,
  PermissionsBitField,
} from "discord.js";
import {
  QueueDoc,
  MatchPlayer,
  saveLobby,
  updateLobby,
  getLobby,
  updateQueue,
  saveDailyRecord,
} from "./firebase";
import { getDotaBot } from "./dota-gc";
import { fetchMatchResult, requestMatchParse } from "./opendota";
import { lobbyEmbed, matchResultEmbed } from "../utils/embeds";
import { inviteMeButton, lobbyControlRow1, lobbyControlRow2, lobbyControlRow3 } from "../utils/buttons";

// NO global tempVoiceChannels array — VCs are tracked per-lobby in Firestore
// so cleanup is always lobby-specific and survives bot restarts
let waitingRoomId: string | null = null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── PHASE 1: 10 min before — warning + waiting room VC ───────

export async function sendPreMatchWarning(client: Client, queue: QueueDoc): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  // Tournament-synthesized queues route all traffic to that tournament's
  // private channel; plain queues use the global queue channel.
  const queueChannelId = queue.tournamentChannelId || process.env.QUEUE_CHANNEL_ID;
  const guild = await client.guilds.fetch(guildId);

  if (queue.players.length === 0) { console.log("[PreMatch] No players, skipping."); return; }

  try {
    const categoryId = process.env.VOICE_CATEGORY_ID;
    const perms: any[] = [
      { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...queue.players.map((p) => ({
        id: p.discordId,
        allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak],
      })),
    ];
    const opts: any = { name: "🎮 Waiting Room", type: ChannelType.GuildVoice, userLimit: queue.maxPlayers + 2, permissionOverwrites: perms };
    if (categoryId) opts.parent = categoryId;

    const wr = (await guild.channels.create(opts)) as VoiceChannel;
    waitingRoomId = wr.id;

    if (queueChannelId) {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      const mentions = queue.players.map((p) => `<@${p.discordId}>`).join(" ");
      const timeStr = queue.scheduledTime
        ? new Date(queue.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
        : "soon";
      await ch.send(
        `⏰ **GAME STARTING SOON!**\n` +
        `💰 **${queue.name}** starts at **${timeStr} IST**\n\n` +
        `Please be ready to join the lobby.\n\n` +
        `🎙️ Waiting Room: <#${wr.id}>\nJoin the voice channel and hang tight!\n\n` +
        `👥 **Players:**\n${mentions}`
      );
    }
    console.log("[PreMatch] Warning sent + waiting room created");
  } catch (err: any) { console.error("[PreMatch] Error:", err.message); }
}

// ── PHASE 2: Match time — create Dota lobby + invite ─────────

export async function startMatchLobby(client: Client, queue: QueueDoc): Promise<string | null> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  // For tournament lobbies, post the embed + admin controls into that
  // tournament's private Discord channel instead of the global control one.
  const lobbyChannelId = queue.tournamentChannelId || process.env.LOBBY_CONTROL_CHANNEL_ID;
  const guild = await client.guilds.fetch(guildId);

  await updateQueue(queue.id, { status: "in_progress" });

  const allPlayers: MatchPlayer[] = queue.players.map((p) => ({
    discordId: p.discordId, username: p.username, steamId: p.steamId,
    steam32Id: p.steam32Id, steamName: p.steamName,
  }));

  // Brand convention: lowercase "iesports" everywhere. Defensively normalize
  // whatever's in DEFAULT_LOBBY_NAME so a stale env var with "IEsports" or
  // "Iesports" still produces the correct casing in Discord + Dota client.
  // User explicitly wants the LOBBY NAME to stay as the brand default ("iesports
  // Lobby") and only the in-slot team headings to change.
  const rawLobbyName = process.env.DEFAULT_LOBBY_NAME || "iesports Lobby";
  const lobbyName = rawLobbyName.replace(/I[Ee]sports/g, "iesports");
  const password = String(Math.floor(100 + Math.random() * 900));
  const gameMode = process.env.DEFAULT_GAME_MODE || "CM";
  const region = process.env.DEFAULT_SERVER_REGION || "India";
  // Tier 2: ask the GC to label the in-slot team headings ("The Radiant" /
  // "The Dire" by default) with the actual team names from the toss. The
  // toss writes radiantTeamName/direTeamName onto the queue doc; if no toss
  // happened, default Radiant=team1, Dire=team2 so the lobby still shows
  // the matchup in the slot headings.
  const queueTeam1Name = (queue as any).team1Name as string | undefined;
  const queueTeam2Name = (queue as any).team2Name as string | undefined;
  const queueRadiantTeamName = (queue as any).radiantTeamName as string | undefined;
  const queueDireTeamName = (queue as any).direTeamName as string | undefined;
  const radiantTeamName = queueRadiantTeamName || queueTeam1Name || undefined;
  const direTeamName    = queueDireTeamName    || queueTeam2Name || undefined;

  // ── Step 1: Create GC Lobby ──────────────────────────────────
  let gcLobbyId: string | null = null;
  let lobbyCreated = false;
  let lobbyFailureReason: string | null = null;

  const bot = getDotaBot();
  console.log(`[Match] bot.isReady() = ${bot.isReady()}`);

  // Wait up to 30s for the GC session to become ready before falling to
  // manual mode. This handles the window where the bot just reconnected
  // (Steam auto-reconnect) but the GC Welcome hasn't arrived yet.
  if (!bot.isReady()) {
    console.log(`[Match] ⚠️  GC not ready — waiting up to 30s for reconnect...`);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      if (bot.isReady()) { console.log(`[Match] ✅ GC became ready`); break; }
    }
    if (!bot.isReady()) {
      lobbyFailureReason = "GC not ready after 30s wait (Steam/Dota Game Coordinator connection down). Try the Restart Bot button in the admin panel.";
    }
  }

  // cm_pick is stamped on the queue doc by the web set-lobby flow when a Dota
  // toss has been completed. 0 = Valve default (random first pick); 1/2 are
  // Radiant/Dire first-pick lock-ins from the toss result.
  const cmPick = Number((queue as any).cmPick || 0);

  if (bot.isReady()) {
    try {
      console.log(`[Match] Creating Dota lobby... cmPick=${cmPick} radiantTeam="${radiantTeamName || "—"}" direTeam="${direTeamName || "—"}"`);
      const result = await bot.createLobby(lobbyName, password, gameMode, region, cmPick, radiantTeamName, direTeamName);
      gcLobbyId = result.lobbyId;
      lobbyCreated = true;
      console.log(`[Match] ✅ Dota lobby created (gcId=${gcLobbyId})`);
    } catch (err: any) {
      console.error(`[Match] ❌ Lobby creation failed: ${err.message}`);
      lobbyFailureReason = `createLobby threw: ${err?.message || String(err)}`;

      // FIX #1/#2: Even if createLobby timed out, check if the lobby
      // was actually created by looking at the bot's live lobby members.
      // The GC often takes >45s to respond but the lobby IS created.
      const liveMembers = bot.getLobbyMembers();
      if (liveMembers.length > 0) {
        console.log(`[Match] 🔄 Lobby appears to exist (${liveMembers.length} members detected) — treating as created`);
        gcLobbyId = "active";
        lobbyCreated = true;
        lobbyFailureReason = null;
      }
    }
  } else {
    console.log(`[Match] ⚠️  Bot still not GC-ready after 30s — falling to manual mode`);
  }

  // ── Step 2: Save to Firestore ────────────────────────────────
  const firestoreLobbyId = await saveLobby({
    queueId: queue.id, gcLobbyId, lobbyName, password, gameMode, serverRegion: region,
    radiant: [], dire: [], spectators: allPlayers,
    tournamentChannelId: queue.tournamentChannelId || null,
    status: "waiting", dotaMatchId: null, winner: null, mvp: null,
    duration: null, playerStats: null, createdAt: new Date().toISOString(), completedAt: null,
  });
  console.log(`[Match] ✅ Firestore lobby saved: ${firestoreLobbyId}`);

  // ── Step 2b: Capture dotaMatchId from lobby state as soon as the GC
  // stamps it onto the practice lobby (happens when the match server is
  // allocated / the game launches). This is the whole point of running
  // the bot inside the lobby — no player-history scan needed afterward,
  // result fetch becomes a direct requestMatchDetails(matchId) call.
  //
  // The listener is registered once per lobby and self-detaches the first
  // time the GC reports a non-zero match_id. Re-using the same `bot`
  // EventEmitter across multiple lobbies in a session is fine because
  // dota-gc resets `liveLobbyMatchId` on createLobby/destroyLobby.
  // Listen for POSTGAME match-complete event from the GC. Fires when Valve
  // stamps a non-zero match_outcome onto the practice-lobby SO (state=3=POSTGAME).
  // This bypasses requestMatchDetails entirely — which Valve denies for our
  // bot account because it's in Unassigned, not a team slot — and gives us
  // the winner side directly from the lobby's own SO that the bot already
  // receives as a lobby member. Self-detaches after first fire.
  const onMatchComplete = async (evt: { matchId: string; matchOutcome: number; radiantWin: boolean; direWin: boolean; members: Array<{ id: number; team: number }>; heroBySteam32: Record<number, number> }) => {
    try {
      console.log(`[Match] 🏁 matchComplete: dota ${evt.matchId} outcome=${evt.matchOutcome} (radiantWin=${evt.radiantWin})`);
      // Figure out which tournament side (team1/team2) was Radiant vs Dire
      // by checking which of the lobby members are on each tournament team.
      const team1Steam32s = new Set<number>();
      const team2Steam32s = new Set<number>();
      for (const p of queue.players) {
        const s32 = p.steam32Id ? Number(p.steam32Id) : 0;
        if (!s32) continue;
        // tournament-side: we don't know team affiliation from queue alone;
        // pull from tournament team docs.
      }
      // Pull both team rosters to determine sides.
      const { getDb } = await import("./firebase");
      const db = getDb();
      const tid = (queue as any).tournamentId;
      const tMatchId = (queue as any).tournamentMatchId;
      const tColl = (queue as any).tournamentCollection || "tournaments";
      if (!tid || !tMatchId) {
        console.log(`[Match] matchComplete fired but no tournament link on queue — skipping write`);
        return;
      }
      const mdoc = await db.collection(tColl).doc(tid).collection("matches").doc(tMatchId).get();
      const mdata: any = mdoc.data() || {};
      const STEAM64_BASE = BigInt("76561197960265728");
      const to32 = (s64?: string | null) => { try { return s64 ? Number(BigInt(s64) - STEAM64_BASE) : 0; } catch { return 0; } };

      const loadTeam = async (teamId: string) => {
        const td = (await db.collection(tColl).doc(tid).collection("teams").doc(teamId).get()).data() as any;
        const out: number[] = [];
        for (const mem of (td?.members || [])) {
          let s32 = mem.steam32Id ? Number(mem.steam32Id) : 0;
          if (!s32 && mem.steamId) s32 = to32(mem.steamId);
          if (!s32) {
            try { const u = (await db.collection("users").doc(mem.uid).get()).data() as any; s32 = to32(u?.steamId); } catch {}
          }
          if (s32 > 0) out.push(s32);
        }
        return out;
      };
      const t1Ids = mdata.team1Id ? await loadTeam(mdata.team1Id) : [];
      const t2Ids = mdata.team2Id ? await loadTeam(mdata.team2Id) : [];

      // Tally which side each tournament team's players landed on
      let t1Rad = 0, t1Dire = 0, t2Rad = 0, t2Dire = 0;
      for (const mem of evt.members) {
        if (mem.team !== 0 && mem.team !== 1) continue;
        if (t1Ids.includes(mem.id)) (mem.team === 0 ? t1Rad++ : t1Dire++);
        if (t2Ids.includes(mem.id)) (mem.team === 0 ? t2Rad++ : t2Dire++);
      }
      const team1Side = t1Rad >= t1Dire ? "radiant" : "dire";
      const team2Side = t2Rad >= t2Dire ? "radiant" : "dire";
      const winnerSide = evt.radiantWin ? "radiant" : (evt.direWin ? "dire" : null);
      let winner: "team1" | "team2" | null = null;
      if (winnerSide === "radiant") winner = team1Side === "radiant" ? "team1" : "team2";
      if (winnerSide === "dire")    winner = team1Side === "dire"    ? "team1" : "team2";

      if (!winner) {
        console.log(`[Match] matchComplete but outcome ${evt.matchOutcome} = no scored result — skipping`);
        return;
      }
      const winnerName = winner === "team1" ? mdata.team1Name : mdata.team2Name;
      const nowIso = new Date().toISOString();
      await db.collection(tColl).doc(tid).collection("matches").doc(tMatchId).set({
        status: "completed",
        winner,
        team1Score: winner === "team1" ? 1 : 0,
        team2Score: winner === "team2" ? 1 : 0,
        completedAt: nowIso,
        dotaMatchId: evt.matchId,
        result: {
          source: "lobby-so-postgame",
          dotaMatchId: evt.matchId,
          radiantWin: evt.radiantWin,
          winnerTeam: winner,
          team1Side, team2Side, matchOutcome: evt.matchOutcome,
          fetchedAt: nowIso,
        },
        games: {
          game1: {
            dotaMatchId: evt.matchId, winner, completedAt: nowIso, status: "completed",
            team1Side, team2Side,
          },
        },
      }, { merge: true });
      console.log(`[Match] ✅ Auto-resolved ${tColl}/${tid}/matches/${tMatchId} → ${winnerName} wins (team1=${team1Side}, team2=${team2Side})`);

      // ── Recompute tournament standings ────────────────────────────────
      // Without this every match-complete leaves the public Standings tab
      // stale until an admin reruns _recomputeDomin8Standings.ts. Cheap
      // idempotent rebuild from the completed matches.
      try {
        const standings: Record<string, any> = {};
        const init = (id: string, name: string) => {
          if (!standings[id]) standings[id] = {
            teamId: id, teamName: name || id,
            played: 0, wins: 0, losses: 0, draws: 0, points: 0,
            killsFor: 0, killsAgainst: 0,
            mapsWon: 0, mapsLost: 0,
          };
        };
        const allCompleted = await db.collection(tColl).doc(tid).collection("matches").where("status", "==", "completed").get();
        for (const md of allCompleted.docs) {
          const x: any = md.data();
          if (!x.team1Id || !x.team2Id) continue;
          let w: "team1" | "team2" | "draw" | null = x.winner ?? null;
          if (!w) {
            const t1 = x.team1Score ?? 0, t2 = x.team2Score ?? 0;
            if (t1 > t2) w = "team1"; else if (t2 > t1) w = "team2";
            else if (t1 === t2 && t1 > 0) w = "draw";
          }
          if (!w) continue;
          init(x.team1Id, x.team1Name); init(x.team2Id, x.team2Name);
          const a = standings[x.team1Id], b = standings[x.team2Id];
          a.played++; b.played++;
          const m1 = x.team1Score || 0, m2 = x.team2Score || 0;
          a.mapsWon += m1; a.mapsLost += m2; b.mapsWon += m2; b.mapsLost += m1;
          if (w === "team1") { a.wins++; b.losses++; a.points += 3; }
          else if (w === "team2") { b.wins++; a.losses++; b.points += 3; }
          else { a.draws++; b.draws++; a.points++; b.points++; }
          const ps: any[] = x.game1?.playerStats || x.playerStats || [];
          if (Array.isArray(ps) && ps.length > 0) {
            const team1Sd = x.result?.team1Side || x.game1?.team1Side;
            let k1 = 0, k2 = 0;
            for (const p of ps) {
              const k = p.kills || 0;
              if (team1Sd) { if (p.side === team1Sd) k1 += k; else k2 += k; }
              else if (p.teamId) { if (p.teamId === x.team1Id) k1 += k; else if (p.teamId === x.team2Id) k2 += k; }
            }
            a.killsFor += k1; a.killsAgainst += k2;
            b.killsFor += k2; b.killsAgainst += k1;
          }
        }
        const existing = await db.collection(tColl).doc(tid).collection("standings").get();
        const newIds = new Set(Object.keys(standings));
        const batch = db.batch();
        for (const d of existing.docs) if (!newIds.has(d.id)) batch.delete(d.ref);
        for (const sid of newIds) {
          const s = standings[sid];
          batch.set(db.collection(tColl).doc(tid).collection("standings").doc(sid), {
            ...s, killDiff: s.killsFor - s.killsAgainst,
          });
        }
        await batch.commit();
        console.log(`[Match] ✅ Standings refreshed (${newIds.size} teams, ${allCompleted.size} completed matches)`);
      } catch (e: any) {
        console.error(`[Match] standings refresh failed: ${e?.message || e}`);
      }

      // ── Post a match-result embed to the tournament's Discord channel ──
      // Mirrors the IDPL_BOT style: green Radiant or red Dire victory header,
      // dotabuff link, side mapping, plus a tag so cleanup-vcs can sweep it
      // later if the admin chooses.
      const tournamentChannelIdForResult = (queue as any).tournamentChannelId
        || (await db.collection(tColl).doc(tid).get()).data()?.discordChannelId;
      if (tournamentChannelIdForResult) {
        try {
          const loserName = winner === "team1" ? mdata.team2Name : mdata.team1Name;
          const winnerSide = team1Side === (evt.radiantWin ? "radiant" : "dire") ? "radiant" : "dire";
          const sideEmoji = winnerSide === "radiant" ? "🟢" : "🔴";
          const sideLabel = winnerSide === "radiant" ? "Radiant" : "Dire";
          const resultMsg = {
            embeds: [{
              title: `🏆 Match Complete — ${winnerName} wins!`,
              description: [
                `${sideEmoji} **${winnerName}** (${sideLabel}) defeated **${loserName}** (${winnerSide === "radiant" ? "Dire" : "Radiant"})`,
                ``,
                `**Dota match ID:** [\`${evt.matchId}\`](https://www.dotabuff.com/matches/${evt.matchId})`,
                `**Tournament:** ${mdata.team1Name} vs ${mdata.team2Name}`,
                ``,
                `Full per-player stats: https://www.dotabuff.com/matches/${evt.matchId}`,
              ].join("\n"),
              color: 0x16a34a,
              footer: { text: "iesports Tournament • auto-resolved from lobby" },
              timestamp: nowIso,
            }],
          };
          const resp = await client.channels.fetch(tournamentChannelIdForResult);
          if (resp && resp.isTextBased() && "send" in resp) {
            const sent = await (resp as any).send(resultMsg);
            // Stash the result-message ID under a separate field — NOT in
            // discordOpsMessageIds — so cleanup-vcs leaves it alone. The
            // match result is the permanent record players want to see;
            // only the prep/setup chatter should disappear on cleanup.
            await db.collection(tColl).doc(tid).collection("matches").doc(tMatchId).set({
              resultMessageId: sent.id,
              resultMessageChannelId: tournamentChannelIdForResult,
            }, { merge: true });
            console.log(`[Match] 📢 Posted result embed to ${tournamentChannelIdForResult} (msg ${sent.id})`);
          }
        } catch (e: any) {
          console.error(`[Match] posting result embed failed: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      console.error(`[Match] matchComplete handler failed: ${e?.message || e}`);
    } finally {
      bot.removeListener("matchComplete", onMatchComplete);
    }
  };
  bot.on("matchComplete", onMatchComplete);

  const onMatchId = async (matchId: string) => {
    try {
      console.log(`[Match] 🎯 dotaMatchId=${matchId} bound to firestoreLobby=${firestoreLobbyId}, queue=${queue.id}`);
      // Stamp it on the lobby doc (covers daily-matches flow).
      try { await updateLobby(firestoreLobbyId, { dotaMatchId: matchId } as any); } catch (e: any) { console.error("[Match] lobby update failed:", e?.message || e); }
      // Stamp it on the queue + tournament fixture (covers the tournament flow).
      const tQueueId = (queue as any).id;
      const tid = (queue as any).tournamentId;
      const tMatchId = (queue as any).tournamentMatchId;
      const tColl = (queue as any).tournamentCollection || "tournaments";
      const gNum = Number((queue as any).tournamentGameNumber || 1);
      const { getDb } = await import("./firebase");
      const db = getDb();
      if (tQueueId) {
        try { await db.collection("botQueues").doc(tQueueId).set({ dotaMatchId: matchId, dotaMatchIdCapturedAt: new Date().toISOString() }, { merge: true }); }
        catch (e: any) { console.error("[Match] queue update failed:", e?.message || e); }
      }
      if (tid && tMatchId) {
        const mref = db.collection(tColl).doc(tid).collection("matches").doc(tMatchId);
        try {
          const gameKey = `game${gNum}`;
          await mref.set({
            dotaMatchId: matchId,
            // Mirror into game1/game2 etc. so the existing match-detail UI
            // (which reads `game1.dotaMatchId`) sees it immediately too.
            [gameKey]: { dotaMatchId: matchId, status: "in_progress" },
            lobbyStatus: "match-running",
          }, { merge: true });
          console.log(`[Match] ✅ ${tColl}/${tid}/matches/${tMatchId}.dotaMatchId = ${matchId} (+ ${gameKey})`);
        } catch (e: any) { console.error("[Match] tournament match update failed:", e?.message || e); }
      }
    } finally {
      bot.removeListener("lobbyMatchId", onMatchId);
    }
  };
  bot.on("lobbyMatchId", onMatchId);

  // ── Step 3: Post lobby embed to Discord ─────────────────────
  // Track the message IDs so the web's cleanup-vcs button can sweep them
  // alongside web-posted embeds (web only knew about its own posts before).
  let lobbyEmbedPosted = false;
  let lobbyEmbedError: string | null = null;
  if (lobbyChannelId) {
    try {
      const ch = (await client.channels.fetch(lobbyChannelId)) as TextChannel;
      const lob = await getLobby(firestoreLobbyId);
      if (lob) {
        // Tournament channel gets the player-facing lobby card + Invite Me
        // button only. Admin controls (Shuffle / Flip / Start / Destroy etc.)
        // are NOT posted to Discord anymore — they live in the admin panel
        // so tournament chat stays crisp.
        const sent1 = await ch.send({ embeds: [lobbyEmbed(lob)], components: [inviteMeButton(firestoreLobbyId)] });
        lobbyEmbedPosted = true;
        console.log(`[Match] ✅ Lobby embed posted to channel ${lobbyChannelId} (msg id ${sent1.id})`);
        // Stash on the tournament match doc (if this lobby is tied to one)
        // so cleanup-vcs sees it in discordOpsMessageIds.
        const tid = (queue as any).tournamentId;
        const tMatchId = (queue as any).tournamentMatchId;
        const tColl = (queue as any).tournamentCollection || "tournaments";
        if (tid && tMatchId) {
          try {
            const { getDb } = await import("./firebase");
            const mref = getDb().collection(tColl).doc(tid).collection("matches").doc(tMatchId);
            const existing = ((await mref.get()).data()?.discordOpsMessageIds || []) as string[];
            await mref.set({
              discordOpsMessageIds: [...existing, sent1.id],
            }, { merge: true });
          } catch (e: any) { console.warn("[Match] track bot msg ids:", e?.message || e); }
        }
      } else {
        lobbyEmbedError = `Lobby doc ${firestoreLobbyId} not found in Firestore`;
        console.error(`[Match] ❌ Lobby embed skipped: ${lobbyEmbedError}`);
      }
    } catch (err: any) {
      lobbyEmbedError = err?.message || String(err);
      console.error(`[Match] ❌ Lobby embed failed: ${lobbyEmbedError}`);
    }
  } else {
    lobbyEmbedError = "No lobbyChannelId resolved (queue.tournamentChannelId + LOBBY_CONTROL_CHANNEL_ID both empty)";
    console.error(`[Match] ❌ Lobby embed skipped: ${lobbyEmbedError}`);
  }
  // Write diagnostic back to the queue doc so the web admin panel can see
  // whether the bot actually posted the lobby embed. Cleared on next run.
  try {
    await updateQueue(queue.id, {
      lobbyEmbedPosted,
      lobbyEmbedError,
      lobbyChannelIdUsed: lobbyChannelId || null,
      lobbyEmbedAt: new Date().toISOString(),
    } as any);
  } catch { /* best-effort diagnostic */ }

  // ── Step 4: Invite players ───────────────────────────────────
  // FIX #2: This now runs because lobbyCreated is true even on late confirmation
  if (lobbyCreated && bot.isReady()) {
    try {
      const ids = allPlayers.map(p => p.steam32Id).filter((id): id is string => !!id);
      console.log(`[Match] Sending GC invites to ${ids.length} players...`);
      await bot.inviteAll(ids);
    } catch (err: any) {
      console.error("[Match] GC invite error:", err.message);
    }
  }

  // ── Step 5: DM every player ──────────────────────────────────
  for (const player of allPlayers) {
    try {
      const member = await guild.members.fetch(player.discordId);
      const modeMsg = lobbyCreated
        ? `A Dota 2 invite has been sent to your Steam account.\nIf you don't see it, join manually:`
        : `Please join the lobby manually:`;
      await member.send(
        `🎮 **iesports Match Starting!**\n\n` +
        `${modeMsg}\n` +
        `Lobby: \`${lobbyName}\`\nPassword: \`${password}\`\n` +
        `Server: ${region} | Mode: ${gameMode}\n\n` +
        `Open Dota 2 → Play → Custom Lobbies → Search for lobby name`
      );
    } catch { /* DMs closed */ }
  }

  // ── Step 6: Announce in #queue ───────────────────────────────
  const queueChannelId = queue.tournamentChannelId || process.env.QUEUE_CHANNEL_ID;
  if (queueChannelId) {
    try {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      const statusMsg = lobbyCreated
        ? `✅ Lobby created! Steam invites sent.`
        : `⚠️ **Auto-lobby failed** — join manually using the details below.\n_Reason:_ ${lobbyFailureReason || "unknown"}\n_How to fix:_ admin can click **Restart Bot** in the panel, then re-fire **Set Lobby & Notify**. Players can open Dota 2 and search the lobby name in Custom Lobbies in the meantime.`;
      const announceMsg = await ch.send(
        `🏟️ **Match Started!**\n${statusMsg}\n` +
        `Name: \`${lobbyName}\` | Password: \`${password}\`\n` +
        `Server: ${region} | Mode: ${gameMode}`
      );
      // Track for cleanup-vcs so the announce gets swept at end of match.
      const tid = (queue as any).tournamentId;
      const tMatchId = (queue as any).tournamentMatchId;
      const tColl = (queue as any).tournamentCollection || "tournaments";
      if (tid && tMatchId && announceMsg?.id) {
        try {
          const { getDb } = await import("./firebase");
          const mref = getDb().collection(tColl).doc(tid).collection("matches").doc(tMatchId);
          const existing = ((await mref.get()).data()?.discordOpsMessageIds || []) as string[];
          await mref.set({
            discordOpsMessageIds: [...existing, announceMsg.id],
          }, { merge: true });
        } catch (e: any) { console.warn("[Match] track announce msg id:", e?.message || e); }
      }
    } catch (err: any) { console.error("[Match] Queue announce error:", err.message); }
  }

  // ── Step 7: Poll Firestore for teams, then move to VCs ───────
  // For tournament queues, the web admin panel creates team-named VCs
  // (🔴 {team1Name}, 🔵 {team2Name}) on the Start Match action via the
  // /api/valorant/match-update endpoint. Skip the bot's generic
  // Radiant/Dire VC creation to avoid duplicates. For non-tournament
  // daily-match queues, keep the existing bot-managed flow.
  const isTournamentQueue = !!(queue as any).tournamentId;
  if (!isTournamentQueue) {
    pollFirestoreForTeams(client, firestoreLobbyId, allPlayers);
  } else {
    console.log(`[Match] tournament queue (${(queue as any).tournamentId}) — skipping bot VC creation; web handles team-named VCs.`);
  }

  await saveDailyRecord(todayKey(), {
    date: todayKey(), queueId: queue.id, lobbyId: firestoreLobbyId,
    playerCount: allPlayers.length, type: queue.type, entryFee: queue.entryFee,
    createdAt: new Date().toISOString(),
  });

  return firestoreLobbyId;
}

// ── PHASE 3: Watch for teams ─────────────────────────────────

export function pollFirestoreForTeams(
  client: Client,
  lobbyDocId: string,
  allPlayers: MatchPlayer[]
): void {
  console.log(`[Teams] Watching lobby ${lobbyDocId} for team assignments...`);

  let vcDone = false;

  const finish = async (radiant: MatchPlayer[], dire: MatchPlayer[]) => {
    if (vcDone) return;
    vcDone = true;
    clearInterval(pollInterval);
    bot.removeListener("lobbyUpdate", gcHandler);
    console.log(`[Teams] ✅ Teams ready — Radiant: ${radiant.length}, Dire: ${dire.length}`);
    await updateLobby(lobbyDocId, { radiant, dire, spectators: [] });
    await createVCsAndMovePlayers(client, lobbyDocId, radiant, dire);
  };

  const bot = getDotaBot();

  const gcHandler = async (lobbyState: any) => {
    if (vcDone) { bot.removeListener("lobbyUpdate", gcHandler); return; }
    const members: Array<{ id: number; team: number }> = lobbyState?.members ?? [];
    const radiant: MatchPlayer[] = [];
    const dire:    MatchPlayer[] = [];
    for (const m of members) {
      const steam32 = m.id?.toString();
      const player  = allPlayers.find(p => p.steam32Id === steam32);
      if (!player) continue;
      if (m.team === 0) radiant.push(player);
      if (m.team === 1) dire.push(player);
    }
    if (radiant.length > 0 && dire.length > 0) {
      await finish(radiant, dire);
    }
  };

  if (bot.isReady()) {
    bot.on("lobbyUpdate", gcHandler);
    setTimeout(() => bot.removeListener("lobbyUpdate", gcHandler), 90 * 60 * 1000);
  }

  let attempts = 0;
  const pollInterval = setInterval(async () => {
    if (vcDone) { clearInterval(pollInterval); return; }
    attempts++;
    if (attempts > 540) {
      clearInterval(pollInterval);
      bot.removeListener("lobbyUpdate", gcHandler);
      return;
    }
    try {
      const lobby = await getLobby(lobbyDocId);
      if (!lobby) { clearInterval(pollInterval); return; }
      if (lobby.status === "cancelled" || lobby.status === "completed") {
        clearInterval(pollInterval);
        bot.removeListener("lobbyUpdate", gcHandler);
        return;
      }
      const radiant = lobby.radiant ?? [];
      const dire    = lobby.dire    ?? [];
      if (radiant.length > 0 && dire.length > 0) {
        await finish(radiant, dire);
      }
    } catch (err: any) {
      console.error("[Teams] Poll error:", err.message);
    }
  }, 10000);
}

// ── VC creation + player movement ────────────────────────────

export async function createVCsAndMovePlayers(
  client: Client,
  lobbyDocId: string,
  radiant: MatchPlayer[],
  dire: MatchPlayer[]
): Promise<{ radiantCh: VoiceChannel; direCh: VoiceChannel }> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const guild = await client.guilds.fetch(guildId);
  const categoryId = process.env.VOICE_CATEGORY_ID;

  const allDiscordIds = [...radiant, ...dire].map((p) => p.discordId);
  const permsBase: any[] = [
    { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
    ...allDiscordIds.map((id) => ({
      id,
      allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak],
    })),
  ];

  const radiantOpts: any = { name: "🟢 Radiant", type: ChannelType.GuildVoice, userLimit: 6, permissionOverwrites: permsBase };
  const direOpts: any    = { name: "🔴 Dire",    type: ChannelType.GuildVoice, userLimit: 6, permissionOverwrites: permsBase };
  if (categoryId) { radiantOpts.parent = categoryId; direOpts.parent = categoryId; }

  const radiantCh = (await guild.channels.create(radiantOpts)) as VoiceChannel;
  const direCh    = (await guild.channels.create(direOpts))    as VoiceChannel;

  // Save VC IDs to Firestore for cleanup
  await updateLobby(lobbyDocId, { vcRadiantId: radiantCh.id, vcDireId: direCh.id } as any);

  // Move players
  for (const player of radiant) {
    try {
      const member = await guild.members.fetch(player.discordId);
      if (member.voice.channel) await member.voice.setChannel(radiantCh);
    } catch {}
  }
  for (const player of dire) {
    try {
      const member = await guild.members.fetch(player.discordId);
      if (member.voice.channel) await member.voice.setChannel(direCh);
    } catch {}
  }

  // Clean up waiting room
  if (waitingRoomId) {
    try {
      const wr = await guild.channels.fetch(waitingRoomId);
      if (wr) await wr.delete("Teams assigned");
    } catch {}
    waitingRoomId = null;
  }

  // Announce — route to the tournament channel if this lobby came from a
  // tournament; otherwise the global lobby-control channel. Each player is
  // @-pinged and their team VC is a clickable channel link, and anyone
  // already in voice was auto-moved above.
  const annLobby = await getLobby(lobbyDocId);
  const lobbyChId = annLobby?.tournamentChannelId || process.env.LOBBY_CONTROL_CHANNEL_ID;
  if (lobbyChId) {
    try {
      const ch = (await client.channels.fetch(lobbyChId)) as TextChannel;
      await ch.send(
        `🎯 **Teams assigned — join your team voice channel now!**\n\n` +
        `🟢 **Radiant** → click to join: <#${radiantCh.id}>\n` +
        `${radiant.map((p) => `<@${p.discordId}>`).join(" ")}\n\n` +
        `🔴 **Dire** → click to join: <#${direCh.id}>\n` +
        `${dire.map((p) => `<@${p.discordId}>`).join(" ")}\n\n` +
        `_Tap the highlighted channel name above to jump straight into your VC. ` +
        `If you were already in a voice channel, the bot moved you automatically._`
      );
    } catch {}
  }

  return { radiantCh, direCh };
}

// ── Voice channel cleanup — lobby-specific ────────────────────

export async function cleanupVoiceChannels(client: Client, lobbyDocId?: string): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  try {
    const guild = await client.guilds.fetch(guildId);

    // Delete VCs for this specific lobby from Firestore IDs
    if (lobbyDocId) {
      try {
        const lobby = await getLobby(lobbyDocId);
        if (lobby) {
          const vcIds = [
            (lobby as any).vcRadiantId,
            (lobby as any).vcDireId,
          ].filter(Boolean);
          for (const chId of vcIds) {
            try {
              const ch = await guild.channels.fetch(chId);
              if (ch) await ch.delete("Match ended");
            } catch {}
          }
        }
      } catch {}
    }

    // Delete waiting room if still exists
    if (waitingRoomId) {
      try {
        const wr = await guild.channels.fetch(waitingRoomId);
        if (wr) await wr.delete("Match ended");
      } catch {}
      waitingRoomId = null;
    }

  } catch (err: any) { console.error("[Cleanup] Error:", err.message); }
}

// ── OpenDota Polling + Match Complete ─────────────────────────

export async function pollForMatchResult(client: Client, lobbyDocId: string, dotaMatchId: string, stakes: number): Promise<void> {
  await requestMatchParse(dotaMatchId);
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const result = await fetchMatchResult(dotaMatchId);
      if (result) {
        clearInterval(interval);
        const lobby = await getLobby(lobbyDocId);
        if (!lobby) return;

        await updateLobby(lobbyDocId, {
          status: "completed",
          winner: result.winner,
          mvp: result.mvp,
          duration: result.duration,
          playerStats: result.players,
          completedAt: new Date().toISOString(),
        });
        await updateQueue(lobby.queueId, { status: "completed" });

        const rch = lobby.tournamentChannelId || process.env.RESULTS_CHANNEL_ID;
        if (rch) {
          try {
            const ch = (await client.channels.fetch(rch)) as TextChannel;
            await ch.send({ embeds: [matchResultEmbed(result, lobby, stakes)] });
          } catch {}
        }

        await cleanupVoiceChannels(client, lobbyDocId);
        console.log(`[Match] ✅ Result recorded: ${result.winner} wins`);
      }
    } catch (err: any) {
      console.error("[Poll] Error:", err.message);
    }

    if (attempts >= 72) {
      clearInterval(interval);
      console.log("[Poll] Timed out after 6 hours");
    }
  }, 5 * 60 * 1000);
}