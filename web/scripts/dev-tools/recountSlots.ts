/**
 * Recompute `slotsBooked` from the roster it is supposed to be counting.
 *
 * `slotsBooked` is a cache of the players subcollection, but it is what the
 * tournament page shows and what "is this tournament full" is checked against.
 * When it drifts, the page lies to players and a slot silently goes unsellable.
 *
 * Horizon read 3/20 with two players in it: a duplicate PayU webhook ran the
 * registration route twice for one player, and both runs incremented. The route
 * is transactional now, so this repairs history rather than a live bug, but the
 * check is worth keeping: it is cheap, and a counter is only ever as good as
 * the last thing that touched it.
 *
 *   npx tsx scripts/dev-tools/recountSlots.ts
 *   npx tsx scripts/dev-tools/recountSlots.ts --apply
 *   npx tsx scripts/dev-tools/recountSlots.ts --game=valorant --id=<tournamentId> --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

config({ path: path.resolve(__dirname, "../../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const GAMES: Record<string, { collection: string; players: string; label: string }> = {
  dota2:     { collection: "tournaments",         players: "players",     label: "Dota 2" },
  dota_solo: { collection: "soloTournaments",     players: "players",     label: "Dota 2 Solo" },
  valorant:  { collection: "valorantTournaments", players: "soloPlayers", label: "Valorant" },
  cs2:       { collection: "cs2Tournaments",      players: "soloPlayers", label: "CS2" },
};

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const APPLY = process.argv.includes("--apply");
const onlyGame = arg("game");
const onlyId = arg("id");

(async () => {
  let drifted = 0;

  for (const [game, cfg] of Object.entries(GAMES)) {
    if (onlyGame && game !== onlyGame) continue;

    const snap = onlyId
      ? { docs: [await db.collection(cfg.collection).doc(onlyId).get()].filter(d => d.exists) }
      : await db.collection(cfg.collection).get();

    for (const d of snap.docs as any[]) {
      const t = d.data() as any;
      const players = await d.ref.collection(cfg.players).get();
      const booked = Number(t.slotsBooked) || 0;
      if (booked === players.size) continue;

      drifted++;
      console.log(`${cfg.label} — ${t.name || d.id}`);
      console.log(`   slotsBooked=${booked}   actual roster=${players.size}   (${booked > players.size ? "over" : "under"}-counted by ${Math.abs(booked - players.size)})`);
      for (const p of players.docs) {
        const u = p.data() as any;
        console.log(`     - ${p.id}  ${u.riotGameName || u.steamName || u.fullName || ""}`);
      }

      if (APPLY) {
        await d.ref.update({ slotsBooked: players.size });
        console.log(`   → corrected to ${players.size}`);
      }
    }
  }

  if (!drifted) console.log("every slot counter matches its roster.");
  else if (!APPLY) console.log(`\n${drifted} tournament(s) drifted. DRY RUN — re-run with --apply to correct.`);
  else console.log(`\n${drifted} tournament(s) corrected.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
