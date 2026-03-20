import SteamUser from "steam-user";
import EventEmitter from "events";

const DOTA2_APP_ID = 570;

const EGCBaseClientMsg = {
  k_EMsgGCClientHello:   4006,
  k_EMsgGCClientWelcome: 4004,
};

// From EDOTAGCMsg enum (C# reference)
const EDOTAGCMsg = {
  k_EMsgGCPracticeLobbyCreate:         7038,
  k_EMsgGCPracticeLobbySetDetails:     7046,
  k_EMsgGCPracticeLobbySetTeamSlot:    7047,  // moves THE BOT ONLY to a slot
  k_EMsgGCPracticeLobbyLeave:          7040,
  k_EMsgGCPracticeLobbyLaunch:         7041,
  k_EMsgGCPracticeLobbyKick:           7081,
  k_EMsgGCPracticeLobbyKickFromTeam:   8047,
  k_EMsgGCBalancedShuffleLobby:        7049,  // GC shuffles all players randomly
  k_EMsgGCFlipLobbyTeams:              7320,  // GC flips Radiant <-> Dire
  k_EMsgDestroyLobbyRequest:           8097,
};

const EGCBaseMsg = {
  k_EMsgGCInviteToLobby: 4512,
};

// DOTA_GC_TEAM enum values
// GOOD_GUYS=0 (Radiant), BAD_GUYS=1 (Dire), SPECTATOR=3, PLAYER_POOL=4 (Unassigned)
const DOTA_GC_TEAM_PLAYER_POOL = 4; // Unassigned

export const REGIONS: Record<string, number> = {
  India: 16, SEA: 5, Singapore: 5,
  "US West": 1, "US East": 2, Europe: 3,
  Korea: 4, Dubai: 6, Australia: 7,
  Stockholm: 8, Austria: 9, Brazil: 10,
  "South Africa": 11, Chile: 14, Peru: 15, Japan: 19,
};

// AP=1 is All Pick — default for IEsports
export const GAME_MODES: Record<string, number> = {
  AP: 1, CM: 2, RD: 3, SD: 4, AR: 5, CD: 16,
};

export interface SteamLobbyResult {
  lobbyId: string;
  password: string;
}

// Lobby member as parsed from GC lobby state update (msgType 7388 / SOCache)
export interface LobbyMember {
  id: number;   // steam32
  team: number; // 0=Radiant, 1=Dire, 4=Unassigned
}

class DotaBot extends EventEmitter {
  private client: SteamUser;
  private ready = false;
  private gcReady = false;
  private gcVersion = 0;
  private helloInterval: NodeJS.Timeout | null = null;
  private ownershipTicket: Buffer | null = null;
  private waitingForLobby = false;
  private pendingTimers: NodeJS.Timeout[] = [];
  private lobbyActive = false;

  constructor() {
    super();
    this.client = new SteamUser({ enablePicsCache: true, changelistUpdateInterval: 0 } as any);
  }

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

        // Log everything except high-frequency spam
        if (this.waitingForLobby) {
          console.log(`[GC:lobby-wait] <- msgType=${msgType} (${payload.length}b)`);
        } else if (![8675, 8678, 8689, 8747, 4009].includes(msgType)) {
          console.log(`[GC] <- ${msgType} (${payload.length}b)`);
        }

        // ── GC Welcome ────────────────────────────────────────────────────────
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
          console.log(`[Dota2] ✅ GC ready! version=${this.gcVersion}`);

          // Destroy any leftover lobby from previous session
          this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
          this.lobbyActive = false;

          resolve();
        }

        // ── Ownership challenge (msgType 24 or 26) ────────────────────────────
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
          if (this.waitingForLobby) this.emit("lobbyCreated");
        }

        // ── Lobby state update (msgType 7388) ─────────────────────────────────
        // Fired by GC whenever any player moves teams (Radiant/Dire/Unassigned),
        // and after Shuffle/Flip. Parse and emit so match-orchestrator can sync
        // teams to Firestore and move Discord VCs automatically.
        if (msgType === 7388 && payload.length > 0) {
          try {
            const members = this.parseLobbyMembers(payload);
            if (members.length > 0) {
              const summary = members
                .map(m => `${m.id}:team${m.team}`)
                .join(", ");
              console.log(`[GC] 📋 LobbyUpdate — ${members.length} members: ${summary}`);
              this.emit("lobbyUpdate", { members });
            }
          } catch {
            // parse errors are non-fatal
          }
        }
      });

      this.client.on("error", (err: any) => {
        if (err.eresult === 6) {
          console.warn("[Steam] ⚠️ LoggedInElsewhere — waiting 20s then retrying...");
          setTimeout(() => this.client.logOn(logOnOptions), 20000);
          return;
        }
        clearTimeout(timeout);
        this.stopHello();
        this.ready = false; this.gcReady = false;
        reject(err);
      });

      this.client.on("disconnected", () => {
        this.ready = false; this.gcReady = false;
        this.stopHello();
      });
    });
  }

  isReady() { return this.ready && this.gcReady; }

  // ── Create Lobby ────────────────────────────────────────────────────────────
  // Default game mode is AP (All Pick = 1)
  async createLobby(
    name: string,
    password: string,
    gameMode = "AP",
    region = "India"
  ): Promise<SteamLobbyResult> {
    if (!this.isReady()) throw new Error("GC not ready");
    const serverRegion = REGIONS[region] ?? 16;
    const mode = GAME_MODES[gameMode] ?? 1; // default AP

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

    // Always destroy first, wait for GC to clear it
    const destroyWait = this.lobbyActive ? 10000 : 4000;
    console.log(`[Dota2] -> Pre-destroy (lobbyActive=${this.lobbyActive}, waiting ${destroyWait}ms)...`);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
    this.lobbyActive = false;
    await new Promise(r => setTimeout(r, destroyWait));
    console.log("[Dota2] -> Sending create...");

    return new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        this.waitingForLobby = false;
        this.removeAllListeners("lobbyCreated");
        reject(new Error("Lobby create timed out (45s)"));
      }, 45000);

      this.waitingForLobby = true;
      this.once("lobbyCreated", () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        this.waitingForLobby = false;
        this.lobbyActive = true;
        console.log("[Dota2] ✅ Lobby confirmed. Kicking bot to Unassigned...");

        // Kick bot from team repeatedly — same logic as the working Leave button.
        // NO applySettings calls here — SetDetails causes GC to re-slot the bot.
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

        [300, 600, 1000, 1500, 2000, 2500, 3000, 4000, 5000,
         6000, 7000, 8000, 10000, 12000, 15000].forEach(d => {
          this.pendingTimers.push(setTimeout(kickSelf, d));
        });

        const rt = setTimeout(() => {
          console.log("[Dota2] ✅ Lobby ready!");
          resolve({ lobbyId: "active", password });
        }, 4000);
        this.pendingTimers.push(rt);
      });

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
      this.bool(10, false), // allow_cheats
      this.bool(11, false), // fill_with_bots
      this.bool(13, true),  // allow_spectating
      this.str(15, password),
      this.vi(33,  0),      // visibility = public
    ]);
  }

  // ── Invite ──────────────────────────────────────────────────────────────────
  invitePlayer(steam32Id: string): void {
    if (!this.isReady()) { console.warn("[Dota2] invitePlayer: not ready"); return; }
    const accountId = parseInt(steam32Id, 10);
    if (isNaN(accountId) || accountId <= 0) { console.warn(`[Dota2] bad steam32="${steam32Id}"`); return; }
    const id64 = BigInt(accountId) + BigInt("76561197960265728");
    const buf = Buffer.alloc(9);
    buf[0] = 0x09; // field 1, wire type 1 (fixed64)
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

  // ── Team Management ─────────────────────────────────────────────────────────
  //
  // IMPORTANT — what the GC actually allows:
  //
  // k_EMsgGCBalancedShuffleLobby (7049):
  //   The GC shuffles ALL players in the lobby randomly across Radiant/Dire.
  //   This is the ONLY way to move other players between teams.
  //   The result is emitted back as a lobby state update (msgType 7388).
  //
  // k_EMsgGCFlipLobbyTeams (7320):
  //   The GC swaps all Radiant players to Dire and vice versa.
  //   Also emitted back as a lobby state update (msgType 7388).
  //
  // k_EMsgGCPracticeLobbySetTeamSlot (7047):
  //   Moves ONLY THE BOT ITSELF to a specific slot.
  //   Cannot be used to move other players. (Confirmed from C# JoinTeam implementation.)
  //
  // k_EMsgGCPracticeLobbyKickFromTeam (8047):
  //   Moves a player from their team back to Unassigned (PLAYER_POOL).
  //   Used to keep bot in Unassigned after lobby creation.

  shuffleTeams(): void {
    if (!this.isReady()) return;
    // Send GC balanced shuffle — GC assigns players randomly to Radiant/Dire
    // Result comes back as lobbyUpdate event (msgType 7388) with new team assignments
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCBalancedShuffleLobby, {}, Buffer.alloc(0));
    console.log("[Dota2] -> BalancedShuffle sent — waiting for GC lobbyUpdate...");
  }

  flipTeams(): void {
    if (!this.isReady()) return;
    // Send GC flip — GC swaps Radiant <-> Dire
    // Result comes back as lobbyUpdate event (msgType 7388) with new team assignments
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCFlipLobbyTeams, {}, Buffer.alloc(0));
    console.log("[Dota2] -> FlipTeams sent — waiting for GC lobbyUpdate...");
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
    } else {
      console.warn("[Dota2] kickBotFromTeam: steam32 unknown");
    }
  }

  kickPlayer(steam32Id: string): void {
    if (!this.isReady()) return;
    const id = parseInt(steam32Id, 10);
    if (!isNaN(id)) {
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKick, {}, this.vi(1, id));
    }
  }

  // ── Start / Destroy ─────────────────────────────────────────────────────────
  startGame(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLaunch, {}, Buffer.alloc(0));
    console.log("[Dota2] ✅ Game launched!");
  }

  async destroyLobby(): Promise<void> {
    if (!this.isReady()) {
      console.warn("[Dota2] destroyLobby: not ready");
      return;
    }

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

    // Per C# reference: bot must be in a team slot to be lobby owner and destroy.
    // Move bot back to Radiant slot 0 (host position) before destroying.
    // CMsgPracticeLobbySetTeamSlot { team=field2, slot=field3 } — moves THE BOT only
    const slotMsg = Buffer.concat([
      this.vi(2, 0), // team = GOOD_GUYS (Radiant)
      this.vi(3, 0), // slot = 0
    ]);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbySetTeamSlot, {}, slotMsg);
    console.log("[Dota2] -> Moving bot to Radiant slot 0 before destroy...");

    await new Promise(r => setTimeout(r, 1500));

    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
    this.lobbyActive = false;
    console.log("[Dota2] ✅ Destroy request sent");
  }

  disconnect(): void {
    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];
    this.stopHello();
    this.ready = false; this.gcReady = false;
    try { this.client.logOff(); } catch {}
  }

  // ── Bot SteamID ─────────────────────────────────────────────────────────────
  private botSteam32 = 0;

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

  // ── Hello / GC session keepalive ────────────────────────────────────────────
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

  // ── Protobuf encode helpers ──────────────────────────────────────────────────
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

  // ── Minimal protobuf decoder (for reading lobby state from GC) ──────────────
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

  // Parse CMsgPracticeLobbyResponse (msgType 7388) members list.
  // Top-level field 3 = repeated CLobbyMember { id=field1(steam32), team=field4 }
  // team: 0=Radiant, 1=Dire, 4=Unassigned
  parseLobbyMembers(buf: Buffer): LobbyMember[] {
    const members: LobbyMember[] = [];
    let pos = 0;

    while (pos < buf.length) {
      const t = this.readVarint(buf, pos); pos = t.pos;
      const fieldNum = t.value >>> 3;
      const wireType = t.value & 0x7;

      if (wireType === 0) {
        const r = this.readVarint(buf, pos); pos = r.pos;
      } else if (wireType === 2) {
        const l = this.readVarint(buf, pos); pos = l.pos;
        const sub = buf.slice(pos, pos + l.value); pos += l.value;

        if (fieldNum === 3) {
          // Parse CLobbyMember sub-message
          let id = 0, team = DOTA_GC_TEAM_PLAYER_POOL, sp = 0;
          while (sp < sub.length) {
            const st = this.readVarint(sub, sp); sp = st.pos;
            const sf = st.value >>> 3, sw = st.value & 0x7;
            if (sw === 0) {
              const sv = this.readVarint(sub, sp); sp = sv.pos;
              if (sf === 1) id   = sv.value; // account_id (steam32)
              if (sf === 4) team = sv.value; // team
            } else if (sw === 2) {
              const sl = this.readVarint(sub, sp); sp = sl.pos + sl.value;
            } else if (sw === 1) { sp += 8; }
            else if (sw === 5) { sp += 4; }
            else break;
          }
          if (id > 0) members.push({ id, team });
        }
      } else if (wireType === 1) { pos += 8; }
      else if (wireType === 5) { pos += 4; }
      else break;
    }

    return members;
  }
}

let instance: DotaBot | null = null;
export function getDotaBot(): DotaBot {
  if (!instance) instance = new DotaBot();
  return instance;
}