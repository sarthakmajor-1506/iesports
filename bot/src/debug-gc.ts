// Run: npx tsx src/debug-gc.ts
import * as dotenv from "dotenv";
dotenv.config();
import SteamUser from "steam-user";

const DOTA2_APP_ID = 570;

function encodeRawVarint(v: number): Buffer {
  const parts: number[] = [];
  let x = v >>> 0; while (x > 0x7f) { parts.push((x & 0x7f) | 0x80); x >>>= 7; } parts.push(x);
  return Buffer.from(parts);
}
function encodeVarint(fn: number, v: number): Buffer {
  const tag = (fn << 3) | 0, parts: number[] = [];
  let t = tag; while (t > 0x7f) { parts.push((t & 0x7f) | 0x80); t >>>= 7; } parts.push(t);
  let x = v >>> 0; while (x > 0x7f) { parts.push((x & 0x7f) | 0x80); x >>>= 7; } parts.push(x);
  return Buffer.from(parts);
}
function encodeString(fn: number, value: string): Buffer {
  const tag = (fn << 3) | 2;
  const strBuf = Buffer.from(value, "utf8");
  return Buffer.concat([encodeRawVarint(tag), encodeRawVarint(strBuf.length), strBuf]);
}
function encodeBool(fn: number, value: boolean): Buffer { return encodeVarint(fn, value ? 1 : 0); }
function encodeBytes(fn: number, data: Buffer): Buffer {
  const tag = (fn << 3) | 2;
  return Buffer.concat([encodeRawVarint(tag), encodeRawVarint(data.length), data]);
}
function encodeSubmessage(fn: number, data: Buffer): Buffer { return encodeBytes(fn, data); }

const client = new SteamUser({ enablePicsCache: true, changelistUpdateInterval: 0 } as any);
const username = process.env.STEAM_ACCOUNT_NAME!;
const password = process.env.STEAM_PASSWORD!;

let ownershipTicket: Buffer | null = null;
let gcReady = false;
let createSent = false;

console.log(`\n🔍 GC Diagnostic v7 — ${username}\n`);

client.logOn({ accountName: username, password });

client.on("loggedOn", () => {
  console.log("✅ Steam logged in.");
  // steam-user v5: ticket comes back as first arg (object with .ticket buffer inside)
  // based on v6 result: appId arg IS the ticket object (208 bytes)
  (client as any).getAppOwnershipTicket(DOTA2_APP_ID, (err: any, ticketObj: any) => {
    if (err) { console.warn(`[Ticket] Error: ${err.message}`); return; }
    if (Buffer.isBuffer(ticketObj) && ticketObj.length > 0) {
      ownershipTicket = ticketObj;
    } else if (ticketObj && typeof ticketObj === 'object') {
      // try every field
      for (const key of Object.keys(ticketObj)) {
        const val = ticketObj[key];
        if (Buffer.isBuffer(val) && val.length > 0) {
          ownershipTicket = val;
          console.log(`[Ticket] ✅ Found in field '${key}' (${val.length} bytes)`);
          break;
        }
      }
      if (!ownershipTicket) {
        // The object itself might be serializable — try the appOwnershipTicket field
        console.log(`[Ticket] Object keys: ${Object.keys(ticketObj).join(', ')}`);
      }
    }
    console.log(`[Ticket] Ready: ${ownershipTicket ? ownershipTicket.length + ' bytes' : 'NONE'}`);
  });
});

(client as any).on("appOwnershipCached", () => {
  console.log("✅ Ownership cached. Launching Dota 2...");
  client.gamesPlayed([DOTA2_APP_ID]);
  setTimeout(() => {
    console.log("[Hello] Sending GC Hello...");
    client.sendToGC(DOTA2_APP_ID, 4006, {}, Buffer.alloc(0));
  }, 1000);
});

// Log ALL GC messages with timestamps
client.on("receivedFromGC", (appId: number, msgType: number, payload: Buffer) => {
  if (appId !== DOTA2_APP_ID) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [GC] ← msgType=${msgType} (${payload.length} bytes)`);

  // Respond to ownership challenge
  if (msgType === 24 && payload.length < 1000 && gcReady) {
    console.log(`[Ticket] 🔑 Challenge! Ticket: ${ownershipTicket ? ownershipTicket.length + 'b' : 'NONE'}`);
    const t = ownershipTicket || Buffer.alloc(0);
    const response = Buffer.concat([
      encodeVarint(1, 1),
      encodeVarint(2, DOTA2_APP_ID),
      encodeBytes(3, t),
    ]);
    console.log(`[Ticket] → Sending msgType=25 (${response.length} bytes)`);
    client.sendToGC(DOTA2_APP_ID, 25, {}, response);
  }

  if (msgType === 4004) {
    gcReady = true;
    console.log(`\n✅ GC WELCOME received!`);
    console.log(`   Waiting 10s for GC to fully initialize before creating lobby...\n`);
    // Wait longer — let all the SO cache messages (7388, 8675, etc.) settle
    setTimeout(sendLobbyCreate, 10000);
  }

  if (msgType === 7039) {
    console.log("\n🎉🎉🎉 msgType=7039 — LOBBY CREATED! 🎉🎉🎉");
    process.exit(0);
  }
  if (msgType === 7055) {
    console.log("\n🎉 msgType=7055 — LOBBY CREATED!");
    process.exit(0);
  }

  // Watch for ANY new message after we send create
  if (createSent && msgType !== 7388 && msgType !== 8675 && msgType !== 8678 && msgType !== 8689 && msgType !== 8747) {
    console.log(`  ^^^ This arrived after lobby create — may be relevant!`);
  }
});

function sendLobbyCreate() {
  const details = Buffer.concat([
    encodeString(2, "test123"),
    encodeVarint(3, 0),    // public
    encodeVarint(4, 1),    // AP
    encodeBool(6, false),
    encodeBool(7, false),
    encodeBool(9, true),
    encodeString(10, "IEsports Test"),
    encodeVarint(21, 8),   // India
  ]);
  const msg = Buffer.concat([encodeString(1, "test123"), encodeSubmessage(2, details)]);

  createSent = true;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [Test] → Sending PracticeLobbyCreate (7038)`);
  console.log(`        hex: ${msg.toString("hex")}`);
  client.sendToGC(DOTA2_APP_ID, 7038, {}, msg);
  console.log(`        Watching 45s for ANY response...\n`);

  setTimeout(() => {
    console.log("─── 45s elapsed ───");
    console.log("No 7039 received.");
    console.log("");
    console.log("ACTION: Check the Dota 2 client on the bot account RIGHT NOW.");
    console.log("If a lobby called 'IEsports Test' exists → lobby IS being created,");
    console.log("the GC just isn't sending 7039 back to us.");
    console.log("If no lobby → GC is still rejecting it.");
    process.exit(0);
  }, 45000);
}

client.on("error", (err: Error) => { console.error(`[Steam] ${err.message}`); process.exit(1); });
setTimeout(() => { console.error("Timed out"); process.exit(1); }, 120000);