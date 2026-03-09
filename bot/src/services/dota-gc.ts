import SteamUser from "steam-user";
import * as protobuf from "protobufjs";
import * as path from "path";
import EventEmitter from "events";

// ─── Dota 2 GC Message IDs ──────────────────────────────────
// From: https://github.com/SteamDatabase/Protobufs/blob/master/dota2/dota_gcmessages_msgid.proto

const DOTA2_APP_ID = 570;

const EGCBaseClientMsg = {
  k_EMsgGCClientHello: 4006,
  k_EMsgGCClientWelcome: 4004,
};

const EDOTAGCMsg = {
  k_EMsgGCPracticeLobbyCreate: 7038,
  k_EMsgGCPracticeLobbyResponse: 7055,
  k_EMsgGCPracticeLobbyJoinBroadcastChannel: 7149,
  k_EMsgGCPracticeLobbyLeave: 7040,
  k_EMsgGCPracticeLobbyLaunch: 7041,
  k_EMsgGCPracticeLobbySetDetails: 7046,
  k_EMsgGCPracticeLobbyKick: 7047,
  k_EMsgGCInviteToLobby: 7048,
  k_EMsgGCBalancedShuffleLobby: 7049,
  k_EMsgGCFlipLobbyTeams: 7320,
  k_EMsgDestroyLobbyRequest: 8097,
  k_EMsgDestroyLobbyResponse: 8098,
  k_EMsgGCPracticeLobbyListResponse: 7042,
  k_EMsgLobbyUpdateBroadcastChannelInfo: 7367,
};

// Dota 2 server regions
const REGIONS: Record<string, number> = {
  India: 8, SEA: 9, Singapore: 9,
  "US West": 1, "US East": 2, Europe: 3,
  Russia: 6, "South Africa": 7, Dubai: 12,
};

// Game modes
const GAME_MODES: Record<string, number> = {
  AP: 1, CM: 2, RD: 3, SD: 4, AR: 5, CD: 16,
};

export interface SteamLobbyResult {
  lobbyId: string;
  password: string;
}

class DotaBot extends EventEmitter {
  private client: SteamUser;
  private ready: boolean = false;
  private gcReady: boolean = false;
  private helloInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.client = new SteamUser();
  }

  async connect(): Promise<void> {
    const username = process.env.STEAM_ACCOUNT_NAME;
    const password = process.env.STEAM_PASSWORD;

    if (!username || !password) {
      throw new Error("STEAM_ACCOUNT_NAME and STEAM_PASSWORD required");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopHello();
        reject(new Error("Steam/Dota GC connection timed out (60s)"));
      }, 60000);

      this.client.logOn({ accountName: username, password });

      this.client.on("loggedOn", () => {
        console.log("[Steam] Logged in. Launching Dota 2...");
        this.client.gamesPlayed([DOTA2_APP_ID]);

        // Send GC Hello repeatedly until we get a Welcome
        this.startHello();
      });

      // Listen for GC messages
      this.client.on("receivedFromGC", (appId: number, msgType: number, payload: Buffer) => {
        if (appId !== DOTA2_APP_ID) return;

        // GC Welcome = we're connected
        if (msgType === EGCBaseClientMsg.k_EMsgGCClientWelcome) {
          this.gcReady = true;
          this.ready = true;
          this.stopHello();
          clearTimeout(timeout);
          console.log("[Dota2] Connected to Game Coordinator!");
          this.emit("gcReady");
          resolve();
        }

        // Lobby response
        if (msgType === EDOTAGCMsg.k_EMsgGCPracticeLobbyResponse) {
          this.emit("lobbyResponse", payload);
        }

        // Lobby update / list
        if (msgType === EDOTAGCMsg.k_EMsgGCPracticeLobbyListResponse) {
          this.emit("lobbyListResponse", payload);
        }
      });

      this.client.on("error", (err: Error) => {
        clearTimeout(timeout);
        this.stopHello();
        console.error("[Steam] Error:", err.message);
        reject(err);
      });

      this.client.on("disconnected", () => {
        console.log("[Steam] Disconnected");
        this.ready = false;
        this.gcReady = false;
        this.stopHello();
      });
    });
  }

  private startHello(): void {
    this.sendHello();
    this.helloInterval = setInterval(() => {
      if (!this.gcReady) {
        this.sendHello();
      } else {
        this.stopHello();
      }
    }, 5000);
  }

  private stopHello(): void {
    if (this.helloInterval) {
      clearInterval(this.helloInterval);
      this.helloInterval = null;
    }
  }

  private sendHello(): void {
    // Send a minimal GC Hello — just an empty protobuf
    // The GC Hello message is basically empty for Dota 2
    const emptyBuf = Buffer.alloc(0);
    this.client.sendToGC(DOTA2_APP_ID, EGCBaseClientMsg.k_EMsgGCClientHello, {}, emptyBuf);
  }

  isReady(): boolean {
    return this.ready && this.gcReady;
  }

  /**
   * Create a practice lobby.
   * Uses raw protobuf encoding via manual buffer construction.
   */
  async createLobby(
    name: string,
    password: string,
    gameMode: string = "CM",
    region: string = "India"
  ): Promise<SteamLobbyResult> {
    if (!this.isReady()) throw new Error("Dota2 GC not connected");

    const serverRegion = REGIONS[region] ?? 8;
    const mode = GAME_MODES[gameMode] ?? 2;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Lobby creation timed out")), 30000);

      // Build the lobby details protobuf manually
      // CMsgPracticeLobbySetDetails fields:
      // 1: game_name (string)
      // 3: game_mode (uint32)
      // 5: server_region (uint32)
      // 6: pass_key (string)
      // 10: allow_spectating (bool)
      // 12: fill_with_bots (bool)
      // 15: visibility (uint32) — 0=public, 1=friends
      const lobbyDetails = this.encodeLobbyDetails(name, password, mode, serverRegion);

      // Listen for lobby response
      const handler = (payload: Buffer) => {
        clearTimeout(timeout);
        this.removeListener("lobbyResponse", handler);
        console.log("[Dota2] Lobby created successfully!");
        resolve({ lobbyId: "active", password });
      };
      this.on("lobbyResponse", handler);

      // k_EMsgGCPracticeLobbyCreate
      // CMsgPracticeLobbyCreate has field 1: lobby_details (CMsgPracticeLobbySetDetails)
      const createMsg = this.encodeCreateLobby(lobbyDetails);

      this.client.sendToGC(
        DOTA2_APP_ID,
        EDOTAGCMsg.k_EMsgGCPracticeLobbyCreate,
        {},
        createMsg
      );

      console.log(`[Dota2] Creating lobby: "${name}" | ${gameMode} | ${region} | pw: ${password}`);
    });
  }

  /**
   * Invite a player to the current lobby by their Steam32 account ID.
   */
  invitePlayer(steam32Id: string): void {
    if (!this.isReady()) return;
    const accountId = parseInt(steam32Id);
    if (isNaN(accountId)) return;

    // k_EMsgGCInviteToLobby — field 1: steam_id (fixed64)
    // Steam ID = steam32 + 76561197960265728
    const steamId64 = BigInt(steam32Id) + BigInt("76561197960265728");
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(steamId64);

    // Wrap in protobuf: field 1 (wire type 1 = fixed64) = 0x09
    const msg = Buffer.concat([Buffer.from([0x09]), buf]);

    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCInviteToLobby, {}, msg);
    console.log(`[Dota2] Invited player steam32: ${steam32Id}`);
  }

  /**
   * Invite multiple players.
   */
  inviteAll(steam32Ids: string[]): void {
    for (const id of steam32Ids) {
      this.invitePlayer(id);
    }
  }

  /**
   * Shuffle teams in lobby.
   */
  shuffleTeams(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCBalancedShuffleLobby, {}, Buffer.alloc(0));
    console.log("[Dota2] Teams shuffled");
  }

  /**
   * Flip teams (swap radiant/dire).
   */
  flipTeams(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCFlipLobbyTeams, {}, Buffer.alloc(0));
    console.log("[Dota2] Teams flipped");
  }

  /**
   * Launch/start the lobby match.
   */
  startGame(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLaunch, {}, Buffer.alloc(0));
    console.log("[Dota2] Game launched!");
  }

  /**
   * Destroy the current lobby.
   */
  destroyLobby(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgDestroyLobbyRequest, {}, Buffer.alloc(0));
    console.log("[Dota2] Lobby destroyed");
  }

  /**
   * Leave the current lobby.
   */
  leaveLobby(): void {
    if (!this.isReady()) return;
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyLeave, {}, Buffer.alloc(0));
    console.log("[Dota2] Left lobby");
  }

  /**
   * Kick a player from lobby.
   */
  kickPlayer(steam32Id: string): void {
    if (!this.isReady()) return;
    const accountId = parseInt(steam32Id);
    if (isNaN(accountId)) return;

    // field 1: account_id (uint32)
    const buf = this.encodeVarint(1, accountId);
    this.client.sendToGC(DOTA2_APP_ID, EDOTAGCMsg.k_EMsgGCPracticeLobbyKick, {}, buf);
    console.log(`[Dota2] Kicked player steam32: ${steam32Id}`);
  }

  /**
   * Disconnect cleanly.
   */
  disconnect(): void {
    this.stopHello();
    this.ready = false;
    this.gcReady = false;
    try { this.client.logOff(); } catch {}
  }

  // ─── Protobuf Encoding Helpers ─────────────────────────────
  // Manual protobuf encoding since we can't use the broken dota2 package.
  // Protobuf wire format: https://protobuf.dev/programming-guides/encoding/

  private encodeVarint(fieldNumber: number, value: number): Buffer {
    const tag = (fieldNumber << 3) | 0; // wire type 0 = varint
    const parts: number[] = [];

    // Encode tag
    let t = tag;
    while (t > 0x7f) { parts.push((t & 0x7f) | 0x80); t >>>= 7; }
    parts.push(t);

    // Encode value
    let v = value >>> 0; // ensure unsigned
    while (v > 0x7f) { parts.push((v & 0x7f) | 0x80); v >>>= 7; }
    parts.push(v);

    return Buffer.from(parts);
  }

  private encodeString(fieldNumber: number, value: string): Buffer {
    const tag = (fieldNumber << 3) | 2; // wire type 2 = length-delimited
    const strBuf = Buffer.from(value, "utf8");
    const lenBuf = this.encodeRawVarint(strBuf.length);
    const tagBuf = this.encodeRawVarint(tag);
    return Buffer.concat([tagBuf, lenBuf, strBuf]);
  }

  private encodeBool(fieldNumber: number, value: boolean): Buffer {
    return this.encodeVarint(fieldNumber, value ? 1 : 0);
  }

  private encodeRawVarint(value: number): Buffer {
    const parts: number[] = [];
    let v = value >>> 0;
    while (v > 0x7f) { parts.push((v & 0x7f) | 0x80); v >>>= 7; }
    parts.push(v);
    return Buffer.from(parts);
  }

  private encodeSubmessage(fieldNumber: number, data: Buffer): Buffer {
    const tag = (fieldNumber << 3) | 2;
    const tagBuf = this.encodeRawVarint(tag);
    const lenBuf = this.encodeRawVarint(data.length);
    return Buffer.concat([tagBuf, lenBuf, data]);
  }

  private encodeLobbyDetails(
    name: string, password: string, gameMode: number, serverRegion: number
  ): Buffer {
    // CMsgPracticeLobbySetDetails
    // field 1: game_name (string)
    // field 3: game_mode (uint32)
    // field 5: server_region (uint32)
    // field 6: pass_key (string)
    // field 10: allow_spectating (bool)
    // field 12: fill_with_bots (bool)
    // field 15: visibility (uint32) — 1 = friends only

    return Buffer.concat([
      this.encodeString(1, name),
      this.encodeVarint(3, gameMode),
      this.encodeVarint(5, serverRegion),
      this.encodeString(6, password),
      this.encodeBool(10, true),   // allow spectating
      this.encodeBool(12, false),  // no bots
      this.encodeVarint(15, 1),    // friends only
    ]);
  }

  private encodeCreateLobby(lobbyDetails: Buffer): Buffer {
    // CMsgPracticeLobbyCreate
    // field 1: lobby_details (CMsgPracticeLobbySetDetails) — submessage
    return this.encodeSubmessage(1, lobbyDetails);
  }
}

// Singleton
let botInstance: DotaBot | null = null;

export function getDotaBot(): DotaBot {
  if (!botInstance) {
    botInstance = new DotaBot();
  }
  return botInstance;
}

export { DotaBot, REGIONS, GAME_MODES };