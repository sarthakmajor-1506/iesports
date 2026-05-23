import SteamUser from "steam-user";
import EventEmitter from "events";
import protobuf from "protobufjs";

const DOTA2_APP_ID = 570;

// ── GC match-data message ids (dota_gcmessages_msgid.proto) ─────────────────
const GC_MSG = {
  MatchDetailsRequest:        7095,
  MatchDetailsResponse:       7096,
  GetPlayerMatchHistory:      7408,
  GetPlayerMatchHistoryResp:  7409,
};

// Self-contained schema (subset of the official Dota protos) — kept inline so
// it works on Railway with no .proto files on disk. Field numbers verified
// against SteamDatabase/Protobufs (dota_gcmessages_common/client.proto).
const GC_SCHEMA = `
syntax = "proto2";
message CMsgGCMatchDetailsRequest { optional uint64 match_id = 1; }
message MPlayer {
  optional uint32 account_id = 1;
  optional uint32 player_slot = 2;
  optional int32  hero_id = 3;
  optional uint32 kills = 14;
  optional uint32 deaths = 15;
  optional uint32 assists = 16;
  optional uint32 last_hits = 19;
  optional uint32 denies = 20;
  optional uint32 gold_per_min = 21;
  optional uint32 xp_per_min = 22;
  optional uint32 hero_damage = 24;
  optional uint32 tower_damage = 25;
  optional uint32 hero_healing = 26;
  optional uint32 level = 27;
  optional uint32 net_worth = 52;
}
message CMsgDOTAMatch {
  repeated MPlayer players = 5;
  optional uint32  duration = 3;
  optional fixed32 starttime = 4;
  optional uint64  match_id = 6;
  optional uint32  lobby_type = 16;
  optional uint32  game_mode = 31;
  optional uint32  match_outcome = 50;
}
message CMsgGCMatchDetailsResponse {
  optional uint32 result = 1;
  optional CMsgDOTAMatch match = 2;
}
message CMsgDOTAGetPlayerMatchHistory {
  optional uint32 account_id = 1;
  optional uint64 start_at_match_id = 2;
  optional uint32 matches_requested = 3;
  optional uint32 request_id = 5;
  optional bool   include_practice_matches = 7;
  optional bool   include_custom_games = 8;
}
message MHMatch {
  optional uint64 match_id = 1;
  optional uint32 start_time = 2;
  optional bool   winner = 4;
  optional uint32 game_mode = 5;
  optional uint32 lobby_type = 8;
  optional uint32 duration = 11;
}
message CMsgDOTAGetPlayerMatchHistoryResponse {
  repeated MHMatch matches = 1;
  optional uint32  request_id = 2;
}`;
let gcRoot: protobuf.Root | null = null;
function gcType(name: string): protobuf.Type {
  if (!gcRoot) gcRoot = protobuf.parse(GC_SCHEMA, { keepCase: true }).root;
  return gcRoot.lookupType(name);
}

export interface DotaPlayerStat {
  accountId: number; slot: number; isRadiant: boolean; heroId: number;
  kills: number; deaths: number; assists: number; lastHits: number; denies: number;
  gpm: number; xpm: number; heroDamage: number; towerDamage: number;
  heroHealing: number; level: number; netWorth: number;
}
export interface DotaMatchDetails {
  matchId: string; result: number; durationSec: number; startTime: number;
  lobbyType: number; gameMode: number; matchOutcome: number;
  radiantWin: boolean | null; players: DotaPlayerStat[];
  rawLen: number; rawHex: string; topFields: string;
}
export interface DotaHistoryEntry {
  matchId: string; startTime: number; lobbyType: number; gameMode: number; durationSec: number;
}

const EGCBaseClientMsg = {
  k_EMsgGCClientHello:   4006,
  k_EMsgGCClientWelcome: 4004,
};

const EDOTAGCMsg = {
  k_EMsgGCPracticeLobbyCreate:         7038,
  k_EMsgGCPracticeLobbySetDetails:     7046,
  k_EMsgGCPracticeLobbySetTeamSlot:    7047,
  k_EMsgGCPracticeLobbyLeave:          7040,
  k_EMsgGCPracticeLobbyLaunch:         7041,
  k_EMsgGCPracticeLobbyKick:           7081,
  k_EMsgGCPracticeLobbyKickFromTeam:   8047,
  k_EMsgGCBalancedShuffleLobby:        7049,
  k_EMsgGCFlipLobbyTeams:             7320,
  k_EMsgDestroyLobbyRequest:           8097,
};

const EGCBaseMsg = {
  k_EMsgGCInviteToLobby: 4512,
};

const DOTA_GC_TEAM_PLAYER_POOL = 4;

// Message types that indicate a lobby state update from GC
// These are the responses we should listen to for lobby creation confirmation
const LOBBY_STATE_MSG_TYPES = new Set([
  7038,  // Response to PracticeLobbyCreate
  7046,  // Response to SetDetails
  7049,  // Response to BalancedShuffle
  7320,  // Response to FlipTeams
  7388,  // Lobby list / state update
  7465,  // Lobby state on ownership challenge
]);

export const REGIONS: Record<string, number> = {
  India: 16, SEA: 5, Singapore: 5,
  "US West": 1, "US East": 2, Europe: 3,
  Korea: 4, Dubai: 6, Australia: 7,
  Stockholm: 8, Austria: 9, Brazil: 10,
  "South Africa": 11, Chile: 14, Peru: 15, Japan: 19,
};

export const GAME_MODES: Record<string, number> = {
  AP: 1, CM: 2, RD: 3, SD: 4, AR: 5, CD: 16,
  ID: 24,  // ← Immortal Draft
};

export interface SteamLobbyResult {
  lobbyId: string;
  password: string;
}

export interface LobbyMember {
  id: number;   // steam32
  team: number; // 0=Radiant, 1=Dire, 4=Unassigned
}

class DotaBot extends EventEmitter {
  private client: SteamUser;
  private ready = false;
  private gcReady = false;
  private gcEverReady = false;          // true after the FIRST GC welcome
  private gcVersion = 0;
  private helloInterval: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null; // post-ready GC keepalive
  private ownershipTicket: Buffer | null = null;
  private waitingForLobby = false;
  private pendingTimers: NodeJS.Timeout[] = [];
  private lobbyActive = false;
  private startupCleanup = false; // true during startup while clearing stale lobby
  botSteam32 = 0;

  // Live lobby state — updated on every GC lobby message
  private liveLobbyMembers: LobbyMember[] = [];
  // The dota match_id that the GC sticks onto the practice-lobby state once
  // a match launches. Captured directly from the lobby payload — much more
  // reliable than scanning player match histories after the fact.
  private liveLobbyMatchId: string = "";
  // The lobby's CSODOTALobby state enum. 0=UI, 1=READYUP, 2=SERVERSETUP, 3=RUN, 4=POSTGAME, 5=NOTREADY, 6=SERVERASSIGN.
  private liveLobbyState: number = -1;

  // Pending GC match-data requests
  private pendingMD = new Map<string, { resolve: (v: DotaMatchDetails) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>();
  private pendingMH: { resolve: (v: DotaHistoryEntry[]) => void; reject: (e: any) => void; timer: NodeJS.Timeout } | null = null;

  constructor() {
    super();
    this.client = new SteamUser({ enablePicsCache: true, changelistUpdateInterval: 0 } as any);
  }

  getLobbyMembers(): LobbyMember[] {
    return this.liveLobbyMembers;
  }

  /** Match id stamped onto the practice lobby by the GC once the match
   *  server is allocated. Empty string until launch. */
  getLobbyMatchId(): string { return this.liveLobbyMatchId; }

  /** Current CSODOTALobby state enum, or -1 if no lobby state has been
   *  observed yet. 3 = RUN (match in progress), 4 = POSTGAME. */
  getLobbyState(): number { return this.liveLobbyState; }

  async connect(): Promise<void> {
    const username = process.env.STEAM_ACCOUNT_NAME;
    const password = process.env.STEAM_PASSWORD;
    if (!username || !password) throw new Error("STEAM_ACCOUNT_NAME / STEAM_PASSWORD missing");

    const savedToken = process.env.STEAM_REFRESH_TOKEN;
    const logOnOptions: any = savedToken
      ? { refreshToken: savedToken }
      : { accountName: username, password, machineName: "IEsports-Railway-Bot" };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopHello();
        reject(new Error("GC connection timed out (90s)"));
      }, 90000);

      this.client.logOn(logOnOptions);

      this.client.on("refreshToken", (token: string) => {
        console.log("[Steam] 🔑 New refresh token — set STEAM_REFRESH_TOKEN in Railway:");
        console.log(token);
      });

      this.client.on("loggedOn", () => {
        console.log(`[Steam] ✅ Logged in as ${username}`);
        this.ready = true;
        (this.client as any).getAppOwnershipTicket(DOTA2_APP_ID, (_: any, t: any) => {
          if (Buffer.isBuffer(t) && t.length > 0) {
            this.ownershipTicket = t;
            console.log(`[Steam] ✅ Ticket cached (${t.length}b)`);
          }
        });
      });

      (this.client as any).on("appOwnershipCached", () => {
        console.log("[Steam] ✅ Launching Dota 2...");
        this.client.gamesPlayed([DOTA2_APP_ID]);
        setTimeout(() => this.startHello(), 1000);
      });

      this.client.on("receivedFromGC", (appId: number, msgType: number, payload: Buffer) => {
        if (appId !== DOTA2_APP_ID) return;

        if (this.waitingForLobby) {
          console.log(`[GC:lobby-wait] <- msgType=${msgType} (${payload.length}b)`);
        } else if (![8675, 8678, 8689, 8747, 4009].includes(msgType)) {
          console.log(`[GC] <- ${msgType} (${payload.length}b)`);
        }

        // ── GC Welcome ──────────────────────────────────────────────────────
        if (msgType === EGCBaseClientMsg.k_EMsgGCClientWelcome) {
          if (payload.length > 1 && payload[0] === 0x08) {
            let val = 0, shift = 0, i = 1;
            while (i < payload.length) {
              const b = payload[i++];
              val |= (b & 0x7f) << shift;
              if (!(b & 0x80)) break;
              shift += 7;
            }
            this.gcVersion = val;
          }
          this.gcReady = true;
          this.stopHello();
          clearTimeout(timeout);
          const firstWelcome = !this.gcEverReady;
          this.gcEverReady = true;
          console.log(`[Dota2] ✅ GC ready! version=${this.gcVersion} (${firstWelcome ? "first welcome" : "RE-welcome/reconnect"})`);

          // Keep the GC session warm so it doesn't idle-drop (an idle drop
          // forces a reconnect AND makes Valve disband the bot's lobby).
          this.startKeepAlive();

          // CRITICAL: the GC sends ClientWelcome on EVERY reconnect, not just
          // the first connect. Destroying/leaving here unconditionally was
          // killing the live tournament lobby ~10 min in (the reported bug).
          // Only clear a stale lobby on the very first welcome AND only when
          // we don't have an intentional active lobby. On any reconnect with
          // an active lobby, preserve it — Valve keeps the practice lobby
          // alive briefly and the bot re-adopts it via the member-state parse.
          if (firstWelcome && !this.lobbyActive) {
            this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
            console.log("[GC] -> Startup DestroyLobbyRequest sent");
            setTimeout(() => {
              this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLeave, {}, Buffer.alloc(0));
              console.log("[GC] -> Startup LobbyLeave sent");
            }, 2000);
            this.lobbyActive = false;
            this.liveLobbyMembers = [];
            this.startupCleanup = true; // ignore stale lobby data during startup

            setTimeout(() => {
              this.startupCleanup = false;
              this.liveLobbyMembers = [];
              console.log("[Steam] ✅ Dota 2 GC connected!");
              resolve();
            }, 8000);
          } else {
            // Reconnect (or already had a lobby) — DO NOT destroy/leave.
            this.startupCleanup = false;
            console.log(`[GC] re-welcome — preserving ${this.lobbyActive ? "ACTIVE lobby" : "session"} (no destroy/leave)`);
            resolve(); // no-op if the connect() promise already settled
          }
        }

        // ── Ownership challenge (msgType 24 or 26) ─────────────────────────
        if ((msgType === 24 || msgType === 26) && payload.length < 1000) {
          const ticket = this.ownershipTicket || Buffer.alloc(0);
          const resp = Buffer.concat([
            this.vi(1, 1),
            this.vi(2, DOTA2_APP_ID),
            this.bytes(3, ticket),
          ]);
          const replyMsg = msgType === 26 ? 27 : 25;
          this.client.sendToGC(DOTA2_APP_ID, replyMsg, {}, resp);
          console.log(`[GC] -> Ticket response sent (${msgType} -> ${replyMsg})`);
        }

        // ── FIX #1: Broad lobby state detection ─────────────────────────────
        // Any GC message that contains lobby member data should:
        // a) Parse members and update live state
        // b) If we're waiting for lobby creation, confirm it
        //
        // Skip during startup cleanup — stale lobby data from previous session
        // should be ignored until the destroy+leave commands have processed.
        if (payload.length > 0 && !this.startupCleanup) {
          try {
            const lob = this.parseLobbyState(payload);
            if (lob.members.length > 0) {
              this.updateLiveLobby(lob.members);

              // If we were waiting for lobby creation, this confirms it
              if (this.waitingForLobby) {
                console.log(`[GC] <- ${msgType} (${payload.length}b) — lobby confirmed via member data`);
                this.emit("lobbyCreated");
              }
            }
            // Capture lobby metadata regardless of member presence — the GC
            // sometimes pushes match-launch lobby states with no member list
            // (just the match_id transition).
            if (lob.state >= 0 && lob.state !== this.liveLobbyState) {
              const prev = this.liveLobbyState;
              this.liveLobbyState = lob.state;
              console.log(`[GC] 🪪 LobbyState transition ${prev} -> ${lob.state}`);
              this.emit("lobbyStateChanged", { prev, next: lob.state, matchId: lob.matchId });
            }
            if (lob.matchId && lob.matchId !== this.liveLobbyMatchId) {
              const prev = this.liveLobbyMatchId;
              this.liveLobbyMatchId = lob.matchId;
              console.log(`[GC] 🎯 dotaMatchId captured from lobby state: ${lob.matchId} (was ${prev || "—"})`);
              this.emit("lobbyMatchId", lob.matchId);
            }
            // Debug: capture the top-level proto fields of larger lobby
            // payloads so we can verify field 60 is actually present (or
            // discover what Valve renamed it to). Exposed via publishLobbyState.
            if (payload.length > 100) {
              this.lastLobbyFields = `msg=${msgType} len=${payload.length} fields=[${this.scanProtoFields(payload)}]`;
            }
          } catch { /* not a lobby payload — that's fine */ }
        }

        // ── Also handle 7465 specifically (lobby state with no members yet) ──
        if (msgType === 7465 && payload.length > 0 && this.waitingForLobby) {
          // 7465 can arrive as lobby confirmation even before members join
          console.log(`[GC] <- 7465 (${payload.length}b) — lobby state signal`);
          this.emit("lobbyCreated");
        }

        // ── Match-data responses ────────────────────────────────────────────
        if (msgType === GC_MSG.MatchDetailsResponse) this.handleMatchDetailsResponse(payload);
        if (msgType === GC_MSG.GetPlayerMatchHistoryResp) this.handleMatchHistoryResponse(payload);
      });

      this.client.on("error", (err: any) => {
        if (err.eresult === 6) {
          console.warn("[Steam] ⚠️ LoggedInElsewhere — waiting 20s then retrying...");
          setTimeout(() => this.client.logOn(logOnOptions), 20000);
          return;
        }
        clearTimeout(timeout);
        this.stopHello();
        this.stopKeepAlive();
        this.ready = false; this.gcReady = false;
        reject(err);
      });

      this.client.on("disconnected", () => {
        this.ready = false; this.gcReady = false;
        this.stopHello();
        this.stopKeepAlive();
        // steam-user auto-reconnects; on the next GC welcome we now PRESERVE
        // an active lobby instead of destroying it.
        console.warn(`[Steam] disconnected (lobbyActive=${this.lobbyActive}) — will reconnect & re-adopt lobby`);
      });
    });
  }

  isReady() { return this.ready && this.gcReady; }

  /** iesportsbot's own steam32 account id (valid after GC ready). */
  getOwnSteam32(): number { return this.getBotSteam32(); }

  /**
   * Ask the GC for a single match's full details. Works for bot-hosted
   * practice/custom lobbies (which the Steam Web API & OpenDota cannot serve).
   * GC-rate-limited — space calls ~1.5s apart when looping.
   */
  async requestMatchDetails(matchId: string | number, timeoutMs = 20000): Promise<DotaMatchDetails> {
    if (!this.gcReady) throw new Error("GC not ready");
    const id = String(matchId);
    const Req = gcType("CMsgGCMatchDetailsRequest");
    const buf = Buffer.from(Req.encode(Req.create({ match_id: id })).finish());
    return new Promise<DotaMatchDetails>((resolve, reject) => {
      const prev = this.pendingMD.get(id);
      if (prev) { clearTimeout(prev.timer); prev.reject(new Error("superseded")); }
      const timer = setTimeout(() => { this.pendingMD.delete(id); reject(new Error(`match-details timeout for ${id}`)); }, timeoutMs);
      this.pendingMD.set(id, { resolve, reject, timer });
      this.client.sendToGC(DOTA2_APP_ID, GC_MSG.MatchDetailsRequest, {}, buf);
      console.log(`[GC] -> MatchDetailsRequest ${id}`);
    });
  }

  /**
   * List a player's recent matches incl. practice + custom lobbies. Default
   * account is iesportsbot itself, which hosted every tournament lobby — so
   * this surfaces all tournament match ids even when none were captured live.
   */
  async requestPlayerMatchHistory(
    opts: { accountId?: number; matchesRequested?: number; startAtMatchId?: string } = {},
    timeoutMs = 20000,
  ): Promise<DotaHistoryEntry[]> {
    if (!this.gcReady) throw new Error("GC not ready");
    const accountId = opts.accountId ?? this.getBotSteam32();
    if (!accountId) throw new Error("no account id for match-history request");
    const Req = gcType("CMsgDOTAGetPlayerMatchHistory");
    const payload: any = {
      account_id: accountId,
      matches_requested: opts.matchesRequested ?? 50,
      include_practice_matches: true,
      include_custom_games: true,
      request_id: (Date.now() & 0x7fffffff),
    };
    if (opts.startAtMatchId) payload.start_at_match_id = opts.startAtMatchId;
    const buf = Buffer.from(Req.encode(Req.create(payload)).finish());
    return new Promise<DotaHistoryEntry[]>((resolve, reject) => {
      if (this.pendingMH) { clearTimeout(this.pendingMH.timer); this.pendingMH.reject(new Error("superseded")); }
      const timer = setTimeout(() => { this.pendingMH = null; reject(new Error("match-history timeout")); }, timeoutMs);
      this.pendingMH = { resolve, reject, timer };
      this.client.sendToGC(DOTA2_APP_ID, GC_MSG.GetPlayerMatchHistory, {}, buf);
      console.log(`[GC] -> GetPlayerMatchHistory account=${accountId}`);
    });
  }

  // Generic top-level protobuf field scan (schema-independent) — for diagnosing
  // what the GC actually sent: "f1:varint=1 f2:len=842 f3:varint=0"
  private scanProtoFields(buf: Buffer): string {
    const parts: string[] = []; let pos = 0;
    try {
      while (pos < buf.length && parts.length < 16) {
        const t = this.readVarint(buf, pos); pos = t.pos;
        const f = t.value >>> 3, w = t.value & 7;
        if (w === 0) { const v = this.readVarint(buf, pos); pos = v.pos; parts.push(`f${f}:v=${v.value}`); }
        else if (w === 1) { pos += 8; parts.push(`f${f}:fx64`); }
        else if (w === 2) { const l = this.readVarint(buf, pos); pos = l.pos; pos += l.value; parts.push(`f${f}:len=${l.value}`); }
        else if (w === 5) { pos += 4; parts.push(`f${f}:fx32`); }
        else { parts.push(`f${f}:w${w}?`); break; }
      }
    } catch { parts.push("…(truncated)"); }
    return parts.join(" ");
  }

  public lastMHDebug = { rawLen: 0, rawCount: 0, fields: "", err: "" };
  // Most recent lobby-state payload's top-level field summary (for debug
  // when match_id capture isn't firing as expected). Published via
  // bot-lobby.publishLobbyState.
  public lastLobbyFields = "";

  private handleMatchDetailsResponse(payload: Buffer): void {
    try {
      const Resp = gcType("CMsgGCMatchDetailsResponse");
      const r: any = Resp.toObject(Resp.decode(payload), { longs: String, defaults: true });
      const m = r.match || {};
      const out = Number(m.match_outcome || 0);
      const players: DotaPlayerStat[] = (m.players || []).map((p: any) => {
        const slot = Number(p.player_slot || 0);
        return {
          accountId: Number(p.account_id || 0), slot, isRadiant: slot < 128,
          heroId: Number(p.hero_id || 0), kills: Number(p.kills || 0), deaths: Number(p.deaths || 0),
          assists: Number(p.assists || 0), lastHits: Number(p.last_hits || 0), denies: Number(p.denies || 0),
          gpm: Number(p.gold_per_min || 0), xpm: Number(p.xp_per_min || 0),
          heroDamage: Number(p.hero_damage || 0), towerDamage: Number(p.tower_damage || 0),
          heroHealing: Number(p.hero_healing || 0), level: Number(p.level || 0),
          netWorth: Number(p.net_worth || 0),
        };
      });
      const res: DotaMatchDetails = {
        matchId: String(m.match_id ?? ""), result: Number(r.result || 0),
        durationSec: Number(m.duration || 0), startTime: Number(m.starttime || 0),
        lobbyType: Number(m.lobby_type || 0), gameMode: Number(m.game_mode || 0),
        matchOutcome: out, radiantWin: out === 2 ? true : out === 3 ? false : null, players,
        rawLen: payload.length, rawHex: payload.slice(0, 48).toString("hex"),
        topFields: this.scanProtoFields(payload),
      };
      const key = this.pendingMD.has(res.matchId) ? res.matchId : [...this.pendingMD.keys()][0];
      const pend = key != null ? this.pendingMD.get(key) : undefined;
      if (pend) { clearTimeout(pend.timer); this.pendingMD.delete(key as string); pend.resolve(res); }
    } catch (e: any) {
      console.warn("[GC] match-details parse error:", e);
      const key = [...this.pendingMD.keys()][0];
      const pend = key != null ? this.pendingMD.get(key) : undefined;
      if (pend) {
        clearTimeout(pend.timer); this.pendingMD.delete(key as string);
        pend.reject(new Error(`decode failed (len=${payload.length}, fields=[${this.scanProtoFields(payload)}]): ${e?.message || e}`));
      }
    }
  }

  private handleMatchHistoryResponse(payload: Buffer): void {
    if (!this.pendingMH) return;
    try {
      const Resp = gcType("CMsgDOTAGetPlayerMatchHistoryResponse");
      const r: any = Resp.toObject(Resp.decode(payload), { longs: String, defaults: true });
      const list: DotaHistoryEntry[] = (r.matches || []).map((m: any) => ({
        matchId: String(m.match_id ?? ""), startTime: Number(m.start_time || 0),
        lobbyType: Number(m.lobby_type || 0), gameMode: Number(m.game_mode || 0),
        durationSec: Number(m.duration || 0),
      })).filter((m: DotaHistoryEntry) => m.matchId && m.matchId !== "0");
      this.lastMHDebug = { rawLen: payload.length, rawCount: (r.matches || []).length, fields: this.scanProtoFields(payload), err: "" };
      const p = this.pendingMH; this.pendingMH = null;
      clearTimeout(p.timer); p.resolve(list);
    } catch (e: any) {
      this.lastMHDebug = { rawLen: payload.length, rawCount: -1, fields: this.scanProtoFields(payload), err: String(e?.message || e) };
      const p = this.pendingMH; this.pendingMH = null;
      if (p) { clearTimeout(p.timer); p.reject(e); }
    }
  }

  private updateLiveLobby(members: LobbyMember[]): void {
    this.liveLobbyMembers = members;
    const summary = members.map(m => `steam32=${m.id}:team${m.team}`).join(", ");
    console.log(`[GC] 📋 LobbyState — ${members.length} members: ${summary}`);
    this.emit("lobbyUpdate", { members });
  }

  // ── Create Lobby ──────────────────────────────────────────────────────────
  // FIX #1: Increased timeout from 45s to 90s, and broadened detection of
  // lobby creation confirmation. The GC often takes >45s to respond but the
  // lobby IS created — we just weren't waiting long enough or detecting the
  // right response messages.
  async createLobby(
    name: string,
    password: string,
    gameMode = "AP",
    region = "India"
  ): Promise<SteamLobbyResult> {
    if (!this.isReady()) throw new Error("GC not ready");
    const serverRegion = REGIONS[region] ?? 16;
    const mode = GAME_MODES[gameMode] ?? 1;

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

    const destroyWait = this.lobbyActive ? 10000 : 4000;
    console.log(`[Dota2] -> Pre-destroy (lobbyActive=${this.lobbyActive}, waiting ${destroyWait}ms)...`);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
    this.lobbyActive = false;
    this.liveLobbyMembers = [];
    this.liveLobbyMatchId = "";
    this.liveLobbyState = -1;
    await new Promise(r => setTimeout(r, destroyWait));
    console.log("[Dota2] -> Sending create...");

    return new Promise((resolve, reject) => {
      let done = false;

      // FIX #1: Register listener BEFORE sending command to avoid race condition
      this.waitingForLobby = true;

      this.once("lobbyCreated", () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutTimer);
        this.waitingForLobby = false;
        this.lobbyActive = true;
        console.log("[Dota2] ✅ Lobby confirmed by GC.");

        // FIX #5: Do NOT kick bot to Unassigned immediately.
        // The bot needs to stay in Radiant slot 0 (host position) so that
        // BalancedShuffle works. Instead, we'll move the bot to Unassigned
        // only AFTER shuffle/teams are assigned, or on a delayed timer.
        // For now, just do a single delayed kick after 30s — enough time
        // for the admin to click Shuffle if they want to.
        const kickSelf = () => {
          const steam32 = this.getBotSteam32();
          if (steam32 > 0) {
            this.client.sendToGC(
              DOTA2_APP_ID,
              EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam,
              {},
              this.vi(1, steam32)
            );
            console.log(`[Dota2] -> KickFromTeam self (steam32=${steam32})`);
          }
        };

        // Delayed self-kick: wait 60s before moving to unassigned
        // This gives time for shuffle commands to execute while bot is host
        const kt = setTimeout(kickSelf, 60000);
        this.pendingTimers.push(kt);

        const rt = setTimeout(() => {
          console.log("[Dota2] ✅ Lobby ready!");
          resolve({ lobbyId: "active", password });
        }, 4000);
        this.pendingTimers.push(rt);
      });

      // FIX #1: Increased timeout from 45s to 90s
      const timeoutTimer = setTimeout(() => {
        if (done) return;
        // Before giving up, check if we have live lobby members
        // (GC confirmed lobby but event was missed)
        if (this.liveLobbyMembers.length > 0) {
          done = true;
          this.waitingForLobby = false;
          this.lobbyActive = true;
          console.log("[Dota2] ✅ Lobby detected via live members (late confirmation)");
          resolve({ lobbyId: "active", password });
          return;
        }
        this.waitingForLobby = false;
        this.removeAllListeners("lobbyCreated");
        reject(new Error("Lobby create timed out (90s)"));
      }, 90000);

      const msg = this.buildCreate(name, password, mode, serverRegion);
      console.log(`[Dota2] -> Create: "${name}" ${gameMode}(${mode}) ${region}(${serverRegion}) pw=${password}`);
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyCreate, {}, msg);
    });
  }

  private buildCreate(name: string, password: string, mode: number, region: number): Buffer {
    return Buffer.concat([
      this.str(5, password),
      this.vi(6, this.gcVersion || 0),
      this.sub(7, this.buildDetails(name, password, mode, region)),
    ]);
  }

  private buildDetails(name: string, password: string, mode: number, region: number): Buffer {
    return Buffer.concat([
      this.str(2,  name),
      this.vi(4,   region),
      this.vi(5,   mode),
      this.bool(10, false),
      this.bool(11, false),
      this.bool(13, true),
      this.str(15, password),
      this.vi(33,  0),
    ]);
  }

  // ── Invite ────────────────────────────────────────────────────────────────
  invitePlayer(steam32Id: string): void {
    if (!this.isReady()) { console.warn("[Dota2] invitePlayer: not ready"); return; }
    const accountId = parseInt(steam32Id, 10);
    if (isNaN(accountId) || accountId <= 0) { console.warn(`[Dota2] bad steam32="${steam32Id}"`); return; }
    const id64 = BigInt(accountId) + BigInt("76561197960265728");
    const buf = Buffer.alloc(9);
    buf[0] = 0x09;
    buf.writeBigUInt64LE(id64, 1);
    this.client.sendToGC(DOTA2_APP_ID, EGCBaseMsg.k_EMsgGCInviteToLobby, {}, buf);
    console.log(`[Dota2] 📨 Invited steam32=${steam32Id} steam64=${id64}`);
  }

  async inviteAll(steam32Ids: string[]): Promise<void> {
    const valid = steam32Ids.filter(id => !!id && !isNaN(parseInt(id, 10)) && parseInt(id, 10) > 0);
    if (!this.isReady()) { console.error("[Dota2] inviteAll: not ready"); return; }
    for (let i = 0; i < valid.length; i++) {
      this.invitePlayer(valid[i]);
      if (i < valid.length - 1) await new Promise(r => setTimeout(r, 400));
    }
    console.log(`[Dota2] ✅ ${valid.length} invites sent`);
  }

  // ── Team Management ───────────────────────────────────────────────────────

  // FIX #5: Before shuffle, ensure bot is in a team slot (Radiant slot 0)
  // so the GC recognizes us as lobby host and processes the command.
  // After shuffle completes, kick bot back to Unassigned.
  shuffleTeams(): Promise<LobbyMember[]> {
    return new Promise(async (resolve) => {
      if (!this.isReady()) { resolve([]); return; }

      // Step 1: Move bot to Radiant slot 0 (host position) so GC processes shuffle
      const steam32 = this.getBotSteam32();
      if (steam32 > 0) {
        // Cancel any pending self-kick timers
        this.pendingTimers.forEach(t => clearTimeout(t));
        this.pendingTimers = [];

        // SetTeamSlot: field 1 = team (0=Radiant), field 2 = slot (0), field 3 = account_id
        const slotMsg = Buffer.concat([
          this.vi(1, 0),           // team = Radiant
          this.vi(2, 0),           // slot = 0 (host)
          this.vi(3, steam32),     // account id
        ]);
        this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbySetTeamSlot, {}, slotMsg);
        console.log(`[Dota2] -> SetTeamSlot: bot to Radiant[0] (steam32=${steam32})`);

        // Wait for GC to process the slot change
        await new Promise(r => setTimeout(r, 2000));
      }

      let settled = false;

      const handler = (lobbyState: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        const members: LobbyMember[] = lobbyState?.members ?? [];
        console.log(`[Dota2] ✅ Shuffle confirmed by GC — ${members.length} members`);

        // Step 3: Kick bot back to Unassigned after shuffle
        this.kickBotFromTeamDelayed(2000);

        resolve(members);
      };

      this.once("lobbyUpdate", handler);

      const fallback = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.removeListener("lobbyUpdate", handler);
        console.warn("[Dota2] ⚠️ Shuffle GC response timeout — using live lobby state");

        // Still kick bot back to Unassigned
        this.kickBotFromTeamDelayed(1000);

        resolve(this.liveLobbyMembers);
      }, 8000);

      // Step 2: Send the actual shuffle command
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCBalancedShuffleLobby, {}, Buffer.alloc(0));
      console.log("[Dota2] -> BalancedShuffle sent — waiting for GC lobbyUpdate...");
    });
  }

  flipTeams(): Promise<LobbyMember[]> {
    return new Promise((resolve) => {
      if (!this.isReady()) { resolve([]); return; }

      let settled = false;

      const handler = (lobbyState: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        const members: LobbyMember[] = lobbyState?.members ?? [];
        console.log(`[Dota2] ✅ Flip confirmed by GC — ${members.length} members`);
        resolve(members);
      };

      this.once("lobbyUpdate", handler);

      const fallback = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.removeListener("lobbyUpdate", handler);
        console.warn("[Dota2] ⚠️ Flip GC response timeout — using live lobby state");
        resolve(this.liveLobbyMembers);
      }, 8000);

      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCFlipLobbyTeams, {}, Buffer.alloc(0));
      console.log("[Dota2] -> FlipTeams sent — waiting for GC lobbyUpdate...");
    });
  }

  kickBotFromTeam(): void {
    if (!this.isReady()) return;
    const steam32 = this.getBotSteam32();
    if (steam32 > 0) {
      this.client.sendToGC(
        DOTA2_APP_ID,
        EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam,
        {},
        this.vi(1, steam32)
      );
      console.log(`[Dota2] -> KickFromTeam self (steam32=${steam32})`);
    }
  }

  // Kick bot after a delay (used after shuffle/flip to clean up)
  private kickBotFromTeamDelayed(delayMs: number): void {
    const t = setTimeout(() => this.kickBotFromTeam(), delayMs);
    this.pendingTimers.push(t);
  }

  kickPlayer(steam32Id: string): void {
    if (!this.isReady()) return;
    const id = parseInt(steam32Id, 10);
    if (!isNaN(id)) {
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKick, {}, this.vi(1, id));
    }
  }

  startGame(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLaunch, {}, Buffer.alloc(0));
    console.log("[Dota2] ✅ Game launched!");
  }

  // ── FIX #4: Destroy Lobby ─────────────────────────────────────────────────
  // Previously this only sent LobbyLeave, which made the bot leave but left
  // a hostless lobby trapping other players. Now we:
  // 1. Kick all known players from the lobby
  // 2. Send DestroyLobbyRequest to actually close the lobby server-side
  // 3. Then send LobbyLeave as cleanup
  async destroyLobby(): Promise<void> {
    if (!this.isReady()) {
      console.warn("[Dota2] destroyLobby: not ready");
      return;
    }

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

    // Step 1: Kick all players from the lobby so they're freed
    const members = [...this.liveLobbyMembers];
    const botSteam32 = this.getBotSteam32();
    for (const m of members) {
      if (m.id !== botSteam32 && m.id > 0) {
        this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKick, {}, this.vi(1, m.id));
        console.log(`[Dota2] -> Kicked steam32=${m.id} from lobby`);
      }
    }

    // Small delay to let kicks process
    if (members.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // Step 2: Send the actual destroy request (kills the lobby server-side)
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
    console.log("[Dota2] -> DestroyLobbyRequest sent");

    // Step 3: Also leave for good measure
    await new Promise(r => setTimeout(r, 500));
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLeave, {}, Buffer.alloc(0));

    this.lobbyActive = false;
    this.liveLobbyMembers = [];
    this.liveLobbyMatchId = "";
    this.liveLobbyState = -1;
    console.log("[Dota2] ✅ Lobby destroyed and bot left");
  }

  disconnect(): void {
    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];
    this.stopHello();
    this.stopKeepAlive();
    this.gcEverReady = false;
    this.ready = false;
    this.gcReady = false;
    this.lobbyActive = false;
    this.liveLobbyMembers = [];
    this.botSteam32 = 0;
    this.removeAllListeners();
    try { this.client.removeAllListeners(); this.client.logOff(); } catch {}
    // Create a fresh SteamUser so connect() can be called again
    this.client = new SteamUser({ enablePicsCache: true, changelistUpdateInterval: 0 } as any);
  }

  // ── Bot SteamID ───────────────────────────────────────────────────────────
  private getBotSteam32(): number {
    if (this.botSteam32 > 0) return this.botSteam32;
    try {
      const sid = (this.client as any).steamID;
      if (!sid) return 0;
      const id = sid.accountid ?? sid.accountID ?? 0;
      this.botSteam32 = typeof id === "number" ? id : Number(id);
      return this.botSteam32;
    } catch { return 0; }
  }

  // ── Hello keepalive ───────────────────────────────────────────────────────
  private startHello(): void {
    this.stopHello();
    const send = () => {
      if (!this.gcReady) {
        this.client.sendToGC(DOTA2_APP_ID, EGCBaseClientMsg.k_EMsgGCClientHello, {}, Buffer.alloc(0));
        console.log("[GC] -> Hello sent");
      }
    };
    send();
    this.helloInterval = setInterval(send, 5000);
  }

  private stopHello(): void {
    if (this.helloInterval) { clearInterval(this.helloInterval); this.helloInterval = null; }
  }

  // Post-ready GC keepalive. Without this the GC session idle-drops after a
  // few minutes; the reconnect both interrupts the lobby and (because Valve
  // sees the host disconnect) disbands the practice lobby. Re-sending a
  // ClientHello every 30s keeps the session warm (same cadence node-dota2 uses).
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.gcReady) {
        try {
          this.client.sendToGC(DOTA2_APP_ID, EGCBaseClientMsg.k_EMsgGCClientHello, {}, Buffer.alloc(0));
        } catch (e: any) {
          console.warn(`[GC] keepalive send failed: ${e?.message || e}`);
        }
      }
    }, 30000);
  }
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
  }

  // ── Protobuf encode helpers ───────────────────────────────────────────────
  private encodeVarint(value: number): Buffer {
    const buf: number[] = [];
    let v = value >>> 0;
    while (v > 0x7f) { buf.push((v & 0x7f) | 0x80); v >>>= 7; }
    buf.push(v & 0x7f);
    return Buffer.from(buf);
  }

  private vi(field: number, value: number): Buffer {
    return Buffer.concat([this.encodeVarint((field << 3) | 0), this.encodeVarint(value)]);
  }

  private str(field: number, value: string): Buffer {
    const data = Buffer.from(value, "utf8");
    return Buffer.concat([this.encodeVarint((field << 3) | 2), this.encodeVarint(data.length), data]);
  }

  private bytes(field: number, value: Buffer): Buffer {
    return Buffer.concat([this.encodeVarint((field << 3) | 2), this.encodeVarint(value.length), value]);
  }

  private sub(field: number, value: Buffer): Buffer {
    return this.bytes(field, value);
  }

  private bool(field: number, value: boolean): Buffer {
    return this.vi(field, value ? 1 : 0);
  }

  // ── Protobuf decode helpers ───────────────────────────────────────────────
  private readVarint(buf: Buffer, pos: number): { value: number; pos: number } {
    let val = 0, shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      val |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return { value: val, pos };
  }

  // ── Main parser — handles the actual GC lobby format ─────────────────────
  // From hex analysis of real GC payload:
  // Members are at field 120 (tag bytes c2 07), wire type 2
  // Each member sub-message: field 1 = fixed64 steam64 (wire type 1)
  //                          field 2 = varint flags
  //                          field 3 = varint team (0=Radiant,1=Dire,4=Unassigned)
  // steam32 = lower 32 bits of steam64
  //
  // Additional lobby-level fields we pull (from
  // SteamDatabase/Protobufs/dota2/dota_gcmessages_common.proto — CSODOTALobby):
  //   field   1 fixed64  lobby_id            (set as soon as the lobby exists)
  //   field   4 varint   state               (0=UI 1=READYUP 2=SERVERSETUP 3=RUN 4=POSTGAME 5=NOTREADY 6=SERVERASSIGN)
  //   field  60 fixed64  match_id            (set once the match server is allocated / launched)
  // We capture these at the top level only — sub-messages don't carry them.
  parseLobbyPayload(buf: Buffer): LobbyMember[] {
    return this.parseLobbyState(buf).members;
  }

  parseLobbyState(buf: Buffer): { members: LobbyMember[]; matchId: string; lobbyId: string; state: number } {
    const members: LobbyMember[] = [];
    let matchId = "";
    let lobbyId = "";
    let state = -1;
    let pos = 0;

    try {
      while (pos < buf.length) {
        const t = this.readVarint(buf, pos); pos = t.pos;
        const fieldNum = t.value >>> 3;
        const wireType = t.value & 0x7;

        if (wireType === 0) {
          const r = this.readVarint(buf, pos); pos = r.pos;
          if (fieldNum === 4) state = r.value;
          // field 60 can in some protobuf builds be encoded as varint instead
          // of fixed64 — be permissive.
          if (fieldNum === 60 && r.value > 0) matchId = String(r.value);
        } else if (wireType === 1) {
          // fixed64 — read low+high 32 bits and stringify as decimal
          if (pos + 8 <= buf.length) {
            const lo = buf.readUInt32LE(pos);
            const hi = buf.readUInt32LE(pos + 4);
            // Compose as BigInt for accurate decimal regardless of size.
            const v = (BigInt(hi) << 32n) | BigInt(lo);
            if (fieldNum === 60 && v > 0n) matchId = v.toString();
            else if (fieldNum === 1 && v > 0n) lobbyId = v.toString();
          }
          pos += 8;
        } else if (wireType === 2) {
          const l = this.readVarint(buf, pos); pos = l.pos;
          const sub = buf.slice(pos, pos + l.value); pos += l.value;

          // Field 120 = members (tag = 120 << 3 | 2 = 0x3c2 = varint c2 07)
          if (fieldNum === 120) {
            const member = this.parseMemberEntry(sub);
            if (member) members.push(member);
          } else {
            // The lobby payload often arrives wrapped — CMsgSO_Update /
            // CMsgSO_CacheSubscribed nest the CSODOTALobby one (or more)
            // levels deep. The existing member parser already recurses
            // for this reason; we MUST also promote match_id / state /
            // lobby_id from nested messages, otherwise the in-lobby
            // matchId capture never fires (the data is there, just one
            // protobuf frame deeper than the outermost SO envelope).
            const nested = this.parseLobbyState(sub);
            for (const m of nested.members) members.push(m);
            if (!matchId && nested.matchId) matchId = nested.matchId;
            if (!lobbyId && nested.lobbyId) lobbyId = nested.lobbyId;
            if (state === -1 && nested.state !== -1) state = nested.state;
          }
        } else if (wireType === 5) {
          // fixed32 — skip
          pos += 4;
        } else {
          break; // unknown wire type — stop
        }
      }
    } catch { /* truncated buffer, return what we have */ }

    return { members, matchId, lobbyId, state };
  }

  // Parse a single CLobbyMember entry
  // field 1 = fixed64 (steam64), field 3 = varint team
  private parseMemberEntry(buf: Buffer): LobbyMember | null {
    let steam64Lo = 0; // lower 32 bits = steam32
    let team = DOTA_GC_TEAM_PLAYER_POOL;
    let pos = 0;
    let hasSteam = false;

    try {
      while (pos < buf.length) {
        const t = this.readVarint(buf, pos); pos = t.pos;
        const fieldNum = t.value >>> 3;
        const wireType = t.value & 0x7;

        if (wireType === 0) {
          const r = this.readVarint(buf, pos); pos = r.pos;
          if (fieldNum === 3) team = r.value; // team field
        } else if (wireType === 1) {
          // fixed64 — read lower 32 bits as steam32
          if (pos + 8 <= buf.length) {
            steam64Lo = buf.readUInt32LE(pos);
            hasSteam = true;
          }
          pos += 8;
        } else if (wireType === 2) {
          const l = this.readVarint(buf, pos); pos = l.pos;
          pos += l.value;
        } else if (wireType === 5) {
          pos += 4;
        } else break;
      }
    } catch { /* truncated */ }

    if (!hasSteam || steam64Lo === 0) return null;
    return { id: steam64Lo, team };
  }

  // Legacy alias
  parseLobbyMembers(buf: Buffer): LobbyMember[] {
    return this.parseLobbyPayload(buf);
  }
}

let instance: DotaBot | null = null;
export function getDotaBot(): DotaBot {
  if (!instance) instance = new DotaBot();
  return instance;
}