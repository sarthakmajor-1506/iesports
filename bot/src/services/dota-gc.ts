import SteamUser from "steam-user";
import EventEmitter from "events";

const DOTA2_APP_ID = 570;

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
  k_EMsgGCPracticeLobbyKickFromTeam:   8047,  // kick self from team → moves to unassigned
  k_EMsgGCBalancedShuffleLobby:        7049,
  k_EMsgGCFlipLobbyTeams:              7320,
  k_EMsgDestroyLobbyRequest:           8097,
};

// Base GC messages (not Dota2-specific)
const EGCBaseMsg = {
  k_EMsgGCInviteToLobby: 4512,  // CMsgInviteToLobby { fixed64 steam_id=1, uint32 client_version=2 }
};

// DOTA_GC_TEAM enum
const DOTA_GC_TEAM = {
  GOOD_GUYS:   0,  // Radiant
  BAD_GUYS:    1,  // Dire
  BROADCASTER: 2,
  SPECTATOR:   3,
  PLAYER_POOL: 4,  // Unassigned ← where bot should sit
  NOTEAM:      5,
};

// ── Verified field numbers from steam-resources protobufs ─────────────────────
// Source: node_modules/steam/node_modules/steam-resources/protobufs/dota2/
//         dota_gcmessages_client_match_management.proto
//
// CMsgPracticeLobbySetDetails:
//   field 2  = game_name (string)
//   field 4  = server_region (uint32)
//   field 5  = game_mode (uint32)
//   field 10 = allow_cheats (bool)
//   field 11 = fill_with_bots (bool)
//   field 13 = allow_spectating (bool)
//   field 15 = pass_key (string)
//   field 33 = visibility (uint32) — 0=public, 1=friends, 2=unlisted
//
// CMsgPracticeLobbyCreate:
//   field 1 = search_key (string)
//   field 5 = pass_key (string)
//   field 6 = client_version (uint32)
//   field 7 = lobby_details (CMsgPracticeLobbySetDetails)

export const REGIONS: Record<string, number> = {
  India: 16, SEA: 5, Singapore: 5,
  "US West": 1, "US East": 2, Europe: 3,
  Korea: 4, Dubai: 6, Australia: 7,
  Stockholm: 8, Austria: 9, Brazil: 10,
  "South Africa": 11, Chile: 14, Peru: 15, Japan: 19,
};

export const GAME_MODES: Record<string, number> = {
  AP: 1, CM: 2, RD: 3, SD: 4, AR: 5, CD: 16,
};

export interface SteamLobbyResult {
  lobbyId: string;
  password: string;
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

  constructor() {
    super();
    this.client = new SteamUser({ enablePicsCache: true, changelistUpdateInterval: 0 } as any);
  }

  async connect(): Promise<void> {
    const username = process.env.STEAM_ACCOUNT_NAME;
    const password = process.env.STEAM_PASSWORD;
    if (!username || !password) throw new Error("STEAM_ACCOUNT_NAME / STEAM_PASSWORD missing");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopHello();
        reject(new Error("GC connection timed out (90s)"));
      }, 90000);

      this.client.logOn({ accountName: username, password });

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
        if (![7388, 8675, 8678, 8689, 8747, 4009].includes(msgType))
          console.log(`[GC] ← ${msgType} (${payload.length}b)`);

        if (msgType === EGCBaseClientMsg.k_EMsgGCClientWelcome) {
          // field 1 = version (varint), tag = 0x08
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
          resolve();
        }

        // Ownership challenge after PracticeLobbyCreate
        if (msgType === 24 && payload.length < 1000 && this.gcReady) {
          const ticket = this.ownershipTicket || Buffer.alloc(0);
          const resp = Buffer.concat([
            this.vi(1, 1),
            this.vi(2, DOTA2_APP_ID),
            this.bytes(3, ticket),
          ]);
          this.client.sendToGC(DOTA2_APP_ID, 25, {}, resp);
          console.log("[GC] → Ticket response sent");
          if (this.waitingForLobby) this.emit("lobbyCreated");
        }
      });

      this.client.on("error", (err: Error) => {
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

  async createLobby(name: string, password: string, gameMode = "CM", region = "India"): Promise<SteamLobbyResult> {
    if (!this.isReady()) throw new Error("GC not ready");
    const serverRegion = REGIONS[region] ?? 7;
    const mode = GAME_MODES[gameMode] ?? 2;

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

    return new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        this.waitingForLobby = false;
        this.removeAllListeners("lobbyCreated");
        reject(new Error("Lobby create timed out (25s)"));
      }, 25000);

      this.waitingForLobby = true;
      this.once("lobbyCreated", () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        this.waitingForLobby = false;
        console.log("[Dota2] ✅ Lobby confirmed. Moving bot to unassigned...");

        // Kick bot from its Radiant slot → moves to Unassigned (PLAYER_POOL)
        // CMsgPracticeLobbyKickFromTeam { account_id = field 1 (uint32) }
        const t0 = setTimeout(() => {
          const botSteam32 = this.getBotSteam32();
          if (botSteam32 > 0) {
            this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam, {}, this.vi(1, botSteam32));
            console.log(`[Dota2] → KickFromTeam self (steam32=${botSteam32}) → Unassigned`);
          } else {
            console.warn("[Dota2] KickFromTeam: bot steam32 unknown");
          }
        }, 1500);
        this.pendingTimers.push(t0);

        // Apply settings at 3s, 6s, 10s
        [3000, 6000, 10000].forEach(d => {
          const t = setTimeout(() => this.applySettings(name, password, mode, serverRegion), d);
          this.pendingTimers.push(t);
        });

        const rt = setTimeout(() => {
          console.log("[Dota2] ✅ Lobby ready!");
          resolve({ lobbyId: "active", password });
        }, 4000);
        this.pendingTimers.push(rt);
      });

      const msg = this.buildCreate(name, password, mode, serverRegion);
      console.log(`[Dota2] → Create: "${name}" ${gameMode}(${mode}) ${region}(${serverRegion}) pw=${password}`);
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyCreate, {}, msg);
    });
  }

  private buildCreate(name: string, password: string, mode: number, region: number): Buffer {
    const details = this.buildDetails(name, password, mode, region);
    return Buffer.concat([
      this.str(5, password),              // pass_key       field 5
      this.vi(6,  this.gcVersion || 0),   // client_version field 6
      this.sub(7, details),               // lobby_details  field 7
    ]);
  }

  private buildDetails(name: string, password: string, mode: number, region: number): Buffer {
    return Buffer.concat([
      this.str(2,  name),        // game_name       field 2
      this.vi(4,   region),      // server_region   field 4
      this.vi(5,   mode),        // game_mode       field 5
      this.bool(10, false),      // allow_cheats    field 10
      this.bool(11, false),      // fill_with_bots  field 11
      this.bool(13, true),       // allow_spectating field 13
      this.str(15, password),    // pass_key        field 15
      this.vi(33,  0),           // visibility=public field 33
    ]);
  }

  private applySettings(name: string, password: string, mode: number, region: number): void {
    if (!this.isReady()) return;
    const details = this.buildDetails(name, password, mode, region);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbySetDetails, {}, details);
    console.log(`[Dota2] → SetDetails: "${name}" mode=${mode} region=${region}`);
  }

  invitePlayer(steam32Id: string): void {
    if (!this.isReady()) { console.warn("[Dota2] invitePlayer: not ready"); return; }
    const accountId = parseInt(steam32Id, 10);
    if (isNaN(accountId) || accountId <= 0) { console.warn(`[Dota2] bad steam32="${steam32Id}"`); return; }
    const id64 = BigInt(accountId) + BigInt("76561197960265728");

    // CMsgInviteToLobby { fixed64 steam_id = 1 }
    // fixed64 = wire type 1 (64-bit), tag = (1 << 3) | 1 = 0x09
    const buf = Buffer.alloc(9);
    buf[0] = 0x09; // field 1, wire type 1 (64-bit fixed)
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

  shuffleTeams(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCBalancedShuffleLobby, {}, Buffer.alloc(0));
  }
  flipTeams(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCFlipLobbyTeams, {}, Buffer.alloc(0));
  }
  startGame(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLaunch, {}, Buffer.alloc(0));
    console.log("[Dota2] ✅ Game launched!");
  }
  // AFTER (fixed)
async destroyLobby(): Promise<void> {
  if (!this.isReady()) {
    console.warn("[Dota2] destroyLobby: not ready");
    return;
  }

  // Step 1: Move bot back to Radiant slot 0 (host position)
  // CMsgPracticeLobbySetTeamSlot { team=0 (Radiant), slot=0 }
  const slotMsg = Buffer.concat([
    this.vi(1, 0), // team = GOOD_GUYS (Radiant)
    this.vi(2, 0), // slot = 0
  ]);
  this.client.sendToGC(
    DOTA2_APP_ID,
    EDOTAGCMsg.k_EMsgGCPracticeLobbySetTeamSlot,
    {},
    slotMsg
  );
  console.log("[Dota2] → Moving bot to host slot before destroy...");

  // Step 2: Wait for GC to process the slot change
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: Send destroy
  this.client.sendToGC(
    DOTA2_APP_ID,
    EDOTAGCMsg.k_EMsgDestroyLobbyRequest,
    {},
    Buffer.alloc(0)
  );
  console.log("[Dota2] ✅ Destroy request sent");
}
  // Kick bot from its Radiant/Dire slot → moves to Unassigned pool
  // Use this instead of leaveLobby so bot stays in lobby as host
  kickBotFromTeam(): void {
    if (!this.isReady()) return;
    const steam32 = this.getBotSteam32();
    if (steam32 > 0) {
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam, {}, this.vi(1, steam32));
      console.log(`[Dota2] → KickFromTeam self (steam32=${steam32})`);
    } else {
      console.warn("[Dota2] kickBotFromTeam: steam32 unknown");
    }
  }
  kickPlayer(steam32Id: string): void {
    if (!this.isReady()) return;
    const id = parseInt(steam32Id, 10);
    if (!isNaN(id)) this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKick, {}, this.vi(1, id));
  }
  disconnect(): void {
    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];
    this.stopHello();
    this.ready = false; this.gcReady = false;
    try { this.client.logOff(); } catch {}
  }

  private botSteam32: number = 0;

  private getBotSteam32(): number {
    if (this.botSteam32 > 0) return this.botSteam32;
    try {
      const sid = (this.client as any).steamID;
      if (!sid) return 0;
      // steam-user SteamID object: accountid is the low 32 bits
      const id = sid.accountid ?? sid.accountID ?? 0;
      this.botSteam32 = typeof id === 'number' ? id : parseInt(id.toString(), 10);
      console.log(`[Dota2] Bot steam32 resolved: ${this.botSteam32}`);
      return this.botSteam32;
    } catch { return 0; }
  }

  private startHello() {
    this.sendHello();
    this.helloInterval = setInterval(() => { if (!this.gcReady) this.sendHello(); else this.stopHello(); }, 5000);
  }
  private stopHello() {
    if (this.helloInterval) { clearInterval(this.helloInterval); this.helloInterval = null; }
  }
  private sendHello() {
    this.client.sendToGC(DOTA2_APP_ID, EGCBaseClientMsg.k_EMsgGCClientHello, {}, Buffer.alloc(0));
  }

  // ── Protobuf encoding ──────────────────────────────────────────────────────
  private raw(v: number): Buffer {
    const p: number[] = [];
    let x = v >>> 0;
    while (x > 0x7f) { p.push((x & 0x7f) | 0x80); x >>>= 7; }
    p.push(x);
    return Buffer.from(p);
  }
  private vi(fn: number, v: number): Buffer {
    return Buffer.concat([this.raw((fn << 3) | 0), this.raw(v)]);
  }
  private str(fn: number, s: string): Buffer {
    const b = Buffer.from(s, "utf8");
    return Buffer.concat([this.raw((fn << 3) | 2), this.raw(b.length), b]);
  }
  private bool(fn: number, v: boolean): Buffer { return this.vi(fn, v ? 1 : 0); }
  private bytes(fn: number, d: Buffer): Buffer {
    return Buffer.concat([this.raw((fn << 3) | 2), this.raw(d.length), d]);
  }
  private sub(fn: number, d: Buffer): Buffer { return this.bytes(fn, d); }
}

let instance: DotaBot | null = null;
export function getDotaBot(): DotaBot {
  if (!instance) instance = new DotaBot();
  return instance;
}
export { DotaBot };