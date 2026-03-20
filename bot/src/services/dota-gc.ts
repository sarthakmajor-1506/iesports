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
  k_EMsgGCPracticeLobbyKickFromTeam:   8047,
  k_EMsgGCBalancedShuffleLobby:        7049,
  k_EMsgGCFlipLobbyTeams:              7320,
  k_EMsgDestroyLobbyRequest:           8097,
};

const EGCBaseMsg = {
  k_EMsgGCInviteToLobby: 4512,
};

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
        console.log("[Steam] 🔑 New refresh token received — set this in Railway as STEAM_REFRESH_TOKEN:");
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

          console.log("[Dota2] -> Clearing any leftover lobby from previous session...");
          this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
          this.lobbyActive = false;

          resolve();
        }

        if ((msgType === 24 || msgType === 26) && payload.length < 1000) {
          const ticket = this.ownershipTicket || Buffer.alloc(0);
          const resp = Buffer.concat([
            this.vi(1, 1),
            this.vi(2, DOTA2_APP_ID),
            this.bytes(3, ticket),
          ]);
          const replyMsg = msgType === 26 ? 27 : 25;
          this.client.sendToGC(DOTA2_APP_ID, replyMsg, {}, resp);
          console.log(`[GC] -> Ticket response sent (msgType ${msgType} -> ${replyMsg})`);
          if (this.waitingForLobby) this.emit("lobbyCreated");
        }

        // 7388 = CMsgPracticeLobbyResponse — fired whenever any player moves
        // between Radiant / Dire / Unassigned in the lobby.
        // Parse the members list and emit "lobbyUpdate" so match-orchestrator
        // can sync team assignments to Firestore in real-time, without needing
        // the admin to click Shuffle/Flip.
        if (msgType === 7388 && payload.length > 0) {
          try {
            const members = this.parseLobbyMembers(payload);
            if (members.length > 0) {
              console.log(`[GC] 📋 LobbyUpdate: ${members.map(m => `steam32=${m.id} team=${m.team}`).join(", ")}`);
              this.emit("lobbyUpdate", { members });
            }
          } catch { /* parse errors are non-fatal */ }
        }
      });

      this.client.on("error", (err: any) => {
        if (err.eresult === 6) {
          console.warn("[Steam] ⚠️  LoggedInElsewhere — waiting 20s for old session to drop, then retrying...");
          setTimeout(() => {
            this.client.logOn(logOnOptions);
          }, 20000);
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

  async createLobby(name: string, password: string, gameMode = "CM", region = "India"): Promise<SteamLobbyResult> {
    if (!this.isReady()) throw new Error("GC not ready");
    const serverRegion = REGIONS[region] ?? 7;
    const mode = GAME_MODES[gameMode] ?? 2;

    this.pendingTimers.forEach(t => clearTimeout(t));
    this.pendingTimers = [];

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
        console.log("[Dota2] ✅ Lobby confirmed. Moving bot to unassigned...");

        const kickSelf = () => {
          const botSteam32 = this.getBotSteam32();
          if (botSteam32 > 0) {
            this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam, {}, this.vi(1, botSteam32));
            console.log(`[Dota2] -> KickFromTeam self (steam32=${botSteam32}) -> Unassigned`);
          } else {
            console.warn("[Dota2] KickFromTeam: bot steam32 unknown");
          }
        };

        // Kick aggressively for 15s — NO applySettings calls here because
        // SetDetails causes the GC to re-slot the bot back into a team.
        // The Leave button works because it ONLY calls kickBotFromTeam(). Do the same.
        [300, 600, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000].forEach(d => {
          const t = setTimeout(kickSelf, d);
          this.pendingTimers.push(t);
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
    const details = this.buildDetails(name, password, mode, region);
    return Buffer.concat([
      this.str(5, password),
      this.vi(6,  this.gcVersion || 0),
      this.sub(7, details),
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
      // Field 37 = bot team slot: 4 = DOTA_GC_TEAM_NOTEAM (unassigned)
      this.vi(37,  4),
    ]);
  }

  private applySettings(name: string, password: string, mode: number, region: number): void {
    if (!this.isReady()) return;
    const details = this.buildDetails(name, password, mode, region);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbySetDetails, {}, details);
    console.log(`[Dota2] -> SetDetails: "${name}" mode=${mode} region=${region}`);
  }

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

  async destroyLobby(): Promise<void> {
    if (!this.isReady()) {
      console.warn("[Dota2] destroyLobby: not ready");
      return;
    }
    this.client.sendToGC(
      DOTA2_APP_ID,
      EDOTAGCMsg.k_EMsgDestroyLobbyRequest,
      {},
      Buffer.alloc(0)
    );
    this.lobbyActive = false;
    console.log("[Dota2] ✅ Destroy request sent");
  }

  kickBotFromTeam(): void {
    if (!this.isReady()) return;
    const steam32 = this.getBotSteam32();
    if (steam32 > 0) {
      this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKickFromTeam, {}, this.vi(1, steam32));
      console.log(`[Dota2] -> KickFromTeam self (steam32=${steam32})`);
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
      const id = sid.accountid ?? sid.accountID ?? 0;
      this.botSteam32 = typeof id === 'number' ? id : Number(id);
      return this.botSteam32;
    } catch {
      return 0;
    }
  }

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

  private vi(field: number, value: number): Buffer {
    const tag = (field << 3) | 0;
    const tagBuf = this.encodeVarint(tag);
    const valBuf = this.encodeVarint(value);
    return Buffer.concat([tagBuf, valBuf]);
  }

  private str(field: number, value: string): Buffer {
    const tag = (field << 3) | 2;
    const tagBuf = this.encodeVarint(tag);
    const data = Buffer.from(value, "utf8");
    const lenBuf = this.encodeVarint(data.length);
    return Buffer.concat([tagBuf, lenBuf, data]);
  }

  private bytes(field: number, value: Buffer): Buffer {
    const tag = (field << 3) | 2;
    const tagBuf = this.encodeVarint(tag);
    const lenBuf = this.encodeVarint(value.length);
    return Buffer.concat([tagBuf, lenBuf, value]);
  }

  private sub(field: number, value: Buffer): Buffer {
    return this.bytes(field, value);
  }

  private bool(field: number, value: boolean): Buffer {
    return this.vi(field, value ? 1 : 0);
  }

  private encodeVarint(value: number): Buffer {
    const buf: number[] = [];
    while (value > 0x7f) {
      buf.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    buf.push(value & 0x7f);
    return Buffer.from(buf);
  }
}

  // ── Minimal protobuf decoder ──────────────────────────────
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

  // Parse CLobbyMember list from CMsgPracticeLobbyResponse (msgType 7388)
  // Top-level field 3 = repeated CLobbyMember { id=field1(uint32), team=field4(uint32) }
  // team values: 0=Radiant, 1=Dire, 4=Unassigned
  parseLobbyMembers(buf: Buffer): Array<{ id: number; team: number }> {
    const members: Array<{ id: number; team: number }> = [];
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
          let id = 0, team = 4, sp = 0;
          while (sp < sub.length) {
            const st = this.readVarint(sub, sp); sp = st.pos;
            const sf = st.value >>> 3, sw = st.value & 0x7;
            if (sw === 0) {
              const sv = this.readVarint(sub, sp); sp = sv.pos;
              if (sf === 1) id   = sv.value;
              if (sf === 4) team = sv.value;
            } else if (sw === 2) { const sl = this.readVarint(sub, sp); sp = sl.pos + sl.value; }
            else if (sw === 1) { sp += 8; } else if (sw === 5) { sp += 4; } else break;
          }
          if (id > 0) members.push({ id, team });
        }
      } else if (wireType === 1) { pos += 8; }
      else if (wireType === 5) { pos += 4; }
      else break;
    }
    return members;
  }

let instance: DotaBot | null = null;
export function getDotaBot(): DotaBot {
  if (!instance) instance = new DotaBot();
  return instance;
}