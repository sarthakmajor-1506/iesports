import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret") || new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tournamentId, clearOnly } = body;
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  // ── Read tournament config ──────────────────────────────────────────────────
  const tourneyRef = adminDb.collection("valorantTournaments").doc(tournamentId);
  const tourneySnap = await tourneyRef.get();
  if (!tourneySnap.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const t = tourneySnap.data()!;

  const playersPerTeam = t.playersPerTeam || 5;
  const totalTeams = t.totalTeams || (t.totalSlots ? Math.floor(t.totalSlots / playersPerTeam) : 8);
  const upperBracketTeams = t.upperBracketTeams || Math.ceil(totalTeams / 2);
  const lowerBracketTeams = t.lowerBracketTeams || Math.floor(totalTeams / 2);
  const groupStageRounds = t.groupStageRounds || 3;
  const bracketFormat = t.bracketFormat || "double_elimination";

  // ── Clear existing dummy data ────────────────────────────────────────────────
  const subcollections = ["teams", "matches", "leaderboard", "standings"];
  let cleared = 0;
  for (const sub of subcollections) {
    const snap = await adminDb.collection("valorantTournaments").doc(tournamentId).collection(sub).get();
    const dummies = snap.docs.filter(d => d.data().isDummy === true);
    const batches: any[] = [];
    let batch = adminDb.batch();
    let count = 0;
    for (const d of dummies) {
      batch.delete(d.ref);
      count++;
      cleared++;
      if (count === 400) { batches.push(batch); batch = adminDb.batch(); count = 0; }
    }
    if (count > 0) batches.push(batch);
    for (const b of batches) await b.commit();
  }

  if (clearOnly) {
    await tourneyRef.update({ dummyDataSeeded: false });
    return NextResponse.json({ ok: true, cleared });
  }

  // ── Team name & player name pools ───────────────────────────────────────────
  const TEAM_NAMES = [
    "Phoenix Rising", "Shadow Stalkers", "Neon Blitz", "Omen's Edge",
    "Viper Strike", "Sage Guard", "Jett Stream", "Breach Force",
    "Cypher Net", "Killjoy Corps", "Reyna Queens", "Sova's Eye",
    "Raze Boom", "Brimstone Co", "Astra Nova", "Chamber Elite",
  ];
  const PLAYER_NAMES = [
    "Arjun", "Vikram", "Ravi", "Siddharth", "Karan", "Rahul", "Aarav",
    "Nikhil", "Priya", "Divya", "Sneha", "Ananya", "Ishaan", "Rohan",
    "Zaid", "Aditya", "Samir", "Dhruv", "Yash", "Manav", "Abhi",
    "Kunal", "Tanay", "Omkar", "Vishal", "Neel", "Hari", "Keshav",
    "Mihir", "Parth", "Tejas", "Dev", "Harsh", "Vivek", "Gaurav",
    "Saurav", "Akash", "Chirag", "Pranav", "Ayush", "Varun", "Udit",
    "Sachin", "Dinesh", "Kartik", "Meera", "Kavya", "Ritika", "Pooja",
    "Shweta",
  ];
  const VALORANT_RANKS = [
    "Iron 1", "Iron 2", "Iron 3",
    "Bronze 1", "Bronze 2", "Bronze 3",
    "Silver 1", "Silver 2", "Silver 3",
    "Gold 1", "Gold 2", "Gold 3",
    "Platinum 1", "Platinum 2", "Platinum 3",
    "Diamond 1", "Diamond 2", "Diamond 3",
    "Ascendant 1", "Ascendant 2", "Ascendant 3",
    "Immortal 1", "Immortal 2", "Immortal 3",
    "Radiant",
  ];

  let rng = 42; // deterministic pseudo-random seeded
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

  // ── 1. Generate dummy teams ──────────────────────────────────────────────────
  const teamIds: string[] = [];
  const teamNames: string[] = [];
  const teamsBatch = adminDb.batch();
  const teamsUsed = Math.min(totalTeams, TEAM_NAMES.length);

  for (let i = 0; i < teamsUsed; i++) {
    const teamName = TEAM_NAMES[i];
    const teamId = `dummy_team_${i + 1}`;
    teamIds.push(teamId);
    teamNames.push(teamName);

    const usedNames = new Set<string>();
    const players = Array.from({ length: playersPerTeam }, (_, j) => {
      let name = pick(PLAYER_NAMES);
      while (usedNames.has(name)) name = pick(PLAYER_NAMES);
      usedNames.add(name);
      const rank = VALORANT_RANKS[randInt(0, VALORANT_RANKS.length - 1)];
      return {
        name,
        riotGameName: name,
        riotTagLine: String(randInt(1000, 9999)),
        riotRank: rank,
        skillLevel: VALORANT_RANKS.indexOf(rank),
        isDummy: true,
      };
    });

    const avgSkill = Math.round(players.reduce((s, p) => s + p.skillLevel, 0) / players.length);

    const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("teams").doc(teamId);
    teamsBatch.set(ref, {
      teamName,
      teamIndex: i,
      players,
      avgSkill,
      wins: 0, losses: 0, draws: 0, points: 0, buchholz: 0,
      isDummy: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await teamsBatch.commit();

  // ── 2. Generate dummy group stage matches ────────────────────────────────────
  // Simple round-robin style: pair teams for each round
  const matchesBatch = adminDb.batch();
  let matchIndex = 1;

  for (let round = 1; round <= groupStageRounds; round++) {
    // Create a shuffled copy of team indices for pairing
    const indices = teamIds.map((_, i) => i);
    // Rotate: offset pairings each round
    const offset = round - 1;
    const paired = new Set<number>();
    const pairs: [number, number][] = [];
    for (let a = 0; a < teamsUsed; a++) {
      if (paired.has(a)) continue;
      const b = (a + offset + 1) % teamsUsed;
      if (b === a || paired.has(b)) {
        // fallback: find next unpaired
        for (let c = 0; c < teamsUsed; c++) {
          if (c !== a && !paired.has(c)) { pairs.push([a, c]); paired.add(a); paired.add(c); break; }
        }
      } else {
        pairs.push([a, b]); paired.add(a); paired.add(b);
      }
    }
    // Handle odd team count — last team gets a bye (skip)
    for (const [ai, bi] of pairs) {
      const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("matches").doc(`dummy_match_g${round}_${matchIndex}`);
      matchesBatch.set(ref, {
        matchDay: round,
        matchIndex,
        team1Id: teamIds[ai],
        team1Name: teamNames[ai],
        team2Id: teamIds[bi],
        team2Name: teamNames[bi],
        team1Score: 0,
        team2Score: 0,
        status: "upcoming",
        isBracket: false,
        game1: null,
        game2: null,
        scheduledTime: null,
        isDummy: true,
      });
      matchIndex++;
    }
  }
  await matchesBatch.commit();

  // ── 3. Generate dummy bracket matches ────────────────────────────────────────
  const bracketBatch = adminDb.batch();
  let bracketMatchIndex = 1;

  if (bracketFormat === "double_elimination") {
    // Upper Bracket rounds
    let ubTeams = upperBracketTeams;
    let ubRound = 1;
    const ubMatchIds: string[] = [];

    while (ubTeams >= 2) {
      const matchCount = Math.floor(ubTeams / 2);
      for (let i = 0; i < matchCount; i++) {
        const matchId = `dummy_bracket_ub${ubRound}_${i + 1}`;
        ubMatchIds.push(matchId);
        const nextUbMatchId = ubRound > 1 ? null : `dummy_bracket_ub${ubRound + 1}_${Math.floor(i / 2) + 1}`;
        const loserGoesTo = ubRound === 1 ? `dummy_bracket_lb1_${i + 1}` : `dummy_bracket_lb${ubRound * 2 - 1}_${Math.floor(i / 2) + 1}`;
        const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("matches").doc(matchId);
        bracketBatch.set(ref, {
          matchDay: 100 + ubRound,
          matchIndex: bracketMatchIndex++,
          team1Id: null, team1Name: "TBD",
          team2Id: null, team2Name: "TBD",
          team1Score: 0, team2Score: 0,
          status: "upcoming",
          isBracket: true,
          bracketRound: ubRound,
          bracketPosition: i + 1,
          bracketType: "upper",
          bracketLabel: `UB R${ubRound} M${i + 1}`,
          winnerGoesTo: matchCount === 1 ? "dummy_bracket_grand_final" : `dummy_bracket_ub${ubRound + 1}_${Math.floor(i / 2) + 1}`,
          loserGoesTo,
          isDummy: true,
        });
      }
      ubTeams = Math.floor(ubTeams / 2);
      ubRound++;
    }

    // Lower Bracket rounds
    let lbTeams = lowerBracketTeams;
    let lbRound = 1;
    while (lbTeams >= 2) {
      const matchCount = Math.floor(lbTeams / 2);
      for (let i = 0; i < matchCount; i++) {
        const matchId = `dummy_bracket_lb${lbRound}_${i + 1}`;
        const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("matches").doc(matchId);
        bracketBatch.set(ref, {
          matchDay: 100 + ubRound + lbRound,
          matchIndex: bracketMatchIndex++,
          team1Id: null, team1Name: "TBD",
          team2Id: null, team2Name: "TBD",
          team1Score: 0, team2Score: 0,
          status: "upcoming",
          isBracket: true,
          bracketRound: lbRound,
          bracketPosition: i + 1,
          bracketType: "lower",
          bracketLabel: `LB R${lbRound} M${i + 1}`,
          winnerGoesTo: matchCount === 1 ? "dummy_bracket_grand_final" : `dummy_bracket_lb${lbRound + 1}_${Math.floor(i / 2) + 1}`,
          loserGoesTo: null,
          isDummy: true,
        });
      }
      lbTeams = Math.floor(lbTeams / 2);
      lbRound++;
    }

    // Grand Final
    const gfRef = adminDb.collection("valorantTournaments").doc(tournamentId).collection("matches").doc("dummy_bracket_grand_final");
    bracketBatch.set(gfRef, {
      matchDay: 200,
      matchIndex: bracketMatchIndex++,
      team1Id: null, team1Name: "TBD",
      team2Id: null, team2Name: "TBD",
      team1Score: 0, team2Score: 0,
      status: "upcoming",
      isBracket: true,
      bracketRound: 99,
      bracketPosition: 1,
      bracketType: "grand_final",
      bracketLabel: "Grand Final",
      winnerGoesTo: null,
      loserGoesTo: null,
      isDummy: true,
    });

  } else {
    // Single elimination
    let seTeams = totalTeams;
    let seRound = 1;
    while (seTeams >= 2) {
      const matchCount = Math.floor(seTeams / 2);
      for (let i = 0; i < matchCount; i++) {
        const matchId = `dummy_bracket_se${seRound}_${i + 1}`;
        const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("matches").doc(matchId);
        bracketBatch.set(ref, {
          matchDay: 100 + seRound,
          matchIndex: bracketMatchIndex++,
          team1Id: null, team1Name: "TBD",
          team2Id: null, team2Name: "TBD",
          team1Score: 0, team2Score: 0,
          status: "upcoming",
          isBracket: true,
          bracketRound: seRound,
          bracketPosition: i + 1,
          bracketType: "upper",
          bracketLabel: matchCount === 1 ? "Final" : `R${seRound} M${i + 1}`,
          winnerGoesTo: matchCount === 1 ? null : `dummy_bracket_se${seRound + 1}_${Math.floor(i / 2) + 1}`,
          loserGoesTo: null,
          isDummy: true,
        });
      }
      seTeams = Math.floor(seTeams / 2);
      seRound++;
    }
  }
  await bracketBatch.commit();

  // ── 4. Generate dummy leaderboard ─────────────────────────────────────────────
  const lbBatch = adminDb.batch();
  let lbEntry = 0;
  const AGENTS = ["Jett", "Reyna", "Omen", "Sage", "Sova", "Killjoy", "Cypher", "Raze", "Breach", "Viper", "Phoenix", "Brimstone", "Astra", "Chamber", "Fade", "Gekko", "Neon", "Skye", "Yoru", "Harbor"];
  for (let ti = 0; ti < teamsUsed; ti++) {
    const teamName = teamNames[ti];
    for (let pi = 0; pi < playersPerTeam; pi++) {
      const uid = `dummy_player_${lbEntry}`;
      const totalKills = randInt(20, 80);
      const totalDeaths = randInt(15, 60);
      const totalAssists = randInt(10, 40);
      const totalRoundsPlayed = randInt(40, 80);
      const totalScore = randInt(totalRoundsPlayed * 100, totalRoundsPlayed * 350);
      const matchesPlayed = randInt(2, 6);
      const kd = Math.round((totalKills / Math.max(1, totalDeaths)) * 100) / 100;
      const hsPercent = randInt(15, 40);
      const totalDamageDealt = randInt(totalRoundsPlayed * 80, totalRoundsPlayed * 200);
      const agentCount = randInt(1, 3);
      const agents = Array.from({ length: agentCount }, () => pick(AGENTS)).filter((v, i, a) => a.indexOf(v) === i);
      const playerName = pick(PLAYER_NAMES);
      const ref = adminDb.collection("valorantTournaments").doc(tournamentId).collection("leaderboard").doc(uid);
      lbBatch.set(ref, {
        uid,
        name: playerName,
        tag: String(randInt(1000, 9999)),
        riotGameName: playerName,
        teamName,
        totalKills,
        totalDeaths,
        totalAssists,
        totalScore,
        totalRoundsPlayed,
        matchesPlayed,
        kd,
        hsPercent,
        totalDamageDealt,
        agents,
        isDummy: true,
      });
      lbEntry++;
    }
  }
  await lbBatch.commit();

  // ── 5. Mark tournament as seeded ────────────────────────────────────────────
  await tourneyRef.update({ dummyDataSeeded: true });

  return NextResponse.json({
    ok: true,
    cleared,
    teams: teamsUsed,
    groupMatches: matchIndex - 1,
    bracketMatches: bracketMatchIndex - 1,
    leaderboardEntries: lbEntry,
  });
}
