/**
 * Source RCON client for the CS2 match server.
 *
 * Zero new dependencies — the Source RCON wire format is small enough to
 * implement on top of node's `net`. Packet layout (all ints little-endian):
 *
 *   int32 size   // byte count of everything AFTER this field
 *   int32 id     // request id, echoed back by the server
 *   int32 type   // 3=AUTH, 2=EXEC / AUTH_RESPONSE, 0=RESPONSE_VALUE
 *   body         // null-terminated ASCII
 *   byte  0      // trailing null (empty string terminator)
 *
 * Two CS2-specific deviations from the classic CS:GO/Source behaviour drove
 * the design here:
 *
 *  1. CS2 does not reliably send the empty RESPONSE_VALUE packet that older
 *     Source servers emit before an AUTH_RESPONSE. We therefore ignore any
 *     type-0 traffic while waiting for auth rather than requiring it.
 *
 *  2. Large responses are split across packets, and CS2 mishandles the
 *     classic "send a second dummy type-0 packet as a sentinel" trick used
 *     to detect the end of a multi-packet response. Instead we accumulate
 *     packets and resolve on a short quiet period (QUIET_MS). This is why
 *     callers must treat RCON output as advisory: the MatchZy webhook is the
 *     source of truth for match state, never `status` parsing.
 *
 * Connection strategy is one short-lived connection per exec batch. A pooled
 * long-lived socket would need reconnect/keepalive handling (see the pain in
 * dota-gc.ts) for no benefit — we issue a handful of commands per match, not
 * a stream.
 *
 * Inert until CS2_RCON_HOST + CS2_RCON_PASSWORD are set, so this is safe to
 * deploy before the server exists.
 */
import * as net from "net";

const TYPE_AUTH = 3;
const TYPE_AUTH_RESPONSE = 2;
const TYPE_EXEC = 2;
const TYPE_RESPONSE_VALUE = 0;

/** Resolve on this much silence after at least one response packet. */
const QUIET_MS = 300;
/** Hard ceiling for a whole exec batch (connect + auth + all commands). */
const BATCH_TIMEOUT_MS = 15_000;

export interface RconTarget {
  host: string;
  port: number;
  password: string;
}

export interface RconResult {
  ok: boolean;
  /** Concatenated server output across every command in the batch. */
  output: string;
  error?: string;
}

/** null when RCON isn't configured — every caller treats that as "skip". */
export function rconTargetFromEnv(): RconTarget | null {
  const host = process.env.CS2_RCON_HOST;
  const password = process.env.CS2_RCON_PASSWORD;
  if (!host || !password) return null;
  return { host, port: Number(process.env.CS2_RCON_PORT || 27015), password };
}

/**
 * Quote and sanitise an argument for interpolation into a console command.
 * Newlines and semicolons would let a value smuggle in extra commands, so
 * they are stripped rather than escaped.
 */
export function rconArg(value: string): string {
  const clean = String(value).replace(/[\r\n;"]/g, "").trim();
  return `"${clean}"`;
}

function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, "ascii");
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0); // id + type + body + 2 nulls
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeUInt8(0, 12 + payload.length);
  buf.writeUInt8(0, 13 + payload.length);
  return buf;
}

interface DecodedPacket { id: number; type: number; body: string; }

/** Pull every complete packet off the front of `buf`; returns the remainder. */
function decodePackets(buf: Buffer): { packets: DecodedPacket[]; rest: Buffer } {
  const packets: DecodedPacket[] = [];
  let offset = 0;
  while (buf.length - offset >= 4) {
    const size = buf.readInt32LE(offset);
    // A malformed size would spin this loop forever — bail and resync by
    // dropping what we have rather than hanging the consumer.
    if (size < 10 || size > 4_194_304) return { packets, rest: Buffer.alloc(0) };
    if (buf.length - offset - 4 < size) break;
    const id = buf.readInt32LE(offset + 4);
    const type = buf.readInt32LE(offset + 8);
    const body = buf.toString("ascii", offset + 12, offset + 4 + size - 2);
    packets.push({ id, type, body });
    offset += 4 + size;
  }
  return { packets, rest: buf.subarray(offset) };
}

/**
 * Authenticate, run `commands` in order, return the concatenated output.
 * Never throws — failures come back as { ok:false, error } so a bad RCON
 * call can't take down the command consumer.
 */
export function rconExec(
  commands: string[],
  target: RconTarget | null = rconTargetFromEnv()
): Promise<RconResult> {
  return new Promise<RconResult>((resolve) => {
    if (!target) {
      resolve({ ok: false, output: "", error: "CS2 RCON not configured (CS2_RCON_HOST / CS2_RCON_PASSWORD)" });
      return;
    }
    const cmds = commands.filter(c => c && c.trim());
    if (!cmds.length) {
      resolve({ ok: true, output: "" });
      return;
    }

    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let authed = false;
    let cmdIndex = 0;
    let collected = "";
    let quietTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const AUTH_ID = 1;
    const cmdId = (i: number) => 100 + i;

    const finish = (r: RconResult) => {
      if (settled) return;
      settled = true;
      if (quietTimer) clearTimeout(quietTimer);
      clearTimeout(batchTimer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(r);
    };

    const batchTimer = setTimeout(
      () => finish({ ok: false, output: collected, error: "RCON timeout" }),
      BATCH_TIMEOUT_MS
    );

    const sendNextCommand = () => {
      if (cmdIndex >= cmds.length) {
        finish({ ok: true, output: collected.trim() });
        return;
      }
      const i = cmdIndex++;
      socket.write(encodePacket(cmdId(i), TYPE_EXEC, cmds[i]));
      armQuietTimer();
    };

    // Multi-packet responses have no reliable terminator on CS2, so a command
    // is considered complete once the server has been silent for QUIET_MS.
    const armQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => { if (!settled) sendNextCommand(); }, QUIET_MS);
    };

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, rest } = decodePackets(buffer);
      buffer = rest;

      for (const p of packets) {
        if (!authed) {
          // id === -1 is the documented auth failure signal. Ignore the
          // optional empty RESPONSE_VALUE some builds send first.
          if (p.type === TYPE_AUTH_RESPONSE) {
            if (p.id === -1) { finish({ ok: false, output: "", error: "RCON auth failed (bad password)" }); return; }
            authed = true;
            sendNextCommand();
          }
          continue;
        }
        if (p.type === TYPE_RESPONSE_VALUE && p.body) collected += p.body;
      }
      if (authed) armQuietTimer();
    });

    socket.on("error", (err: any) => {
      finish({ ok: false, output: collected, error: `RCON socket error: ${err?.message || err}` });
    });
    socket.on("close", () => {
      // A clean close after auth means the server hung up mid-batch; return
      // whatever we managed to collect rather than reporting a hard failure.
      if (authed) finish({ ok: true, output: collected.trim() });
      else finish({ ok: false, output: "", error: "RCON connection closed before auth" });
    });

    socket.setTimeout(BATCH_TIMEOUT_MS);
    socket.on("timeout", () => finish({ ok: false, output: collected, error: "RCON socket timeout" }));

    socket.connect(target.port, target.host, () => {
      socket.write(encodePacket(AUTH_ID, TYPE_AUTH, target.password));
    });
  });
}

// ── `status` parsing ─────────────────────────────────────────────────────
// Advisory only. Used to render the admin panel, never to decide match state.

export interface CS2ServerStatus {
  hostname: string | null;
  map: string | null;
  humans: number | null;
  bots: number | null;
  maxPlayers: number | null;
  raw: string;
}

export function parseStatus(raw: string): CS2ServerStatus {
  const pick = (re: RegExp): string | null => {
    const m = raw.match(re);
    return m ? m[1].trim() : null;
  };
  const players = raw.match(/players\s*:\s*(\d+)\s+humans?,\s*(\d+)\s+bots?\s*\((\d+)\/?\d*\s*max\)/i);
  return {
    hostname: pick(/hostname\s*:\s*(.+)/i),
    map: pick(/^\s*map\s*:\s*(\S+)/im),
    humans: players ? Number(players[1]) : null,
    bots: players ? Number(players[2]) : null,
    maxPlayers: players ? Number(players[3]) : null,
    raw,
  };
}
