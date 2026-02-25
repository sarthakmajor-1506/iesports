import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndStoreRank } from "@/lib/opendota";
import { FieldValue } from "firebase-admin/firestore";


export async function POST(req: NextRequest) {
  try {
    const { code, uid } = await req.json();
    if (!code || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Find team by code
    const snap = await adminDb.collection("teams").where("teamCode", "==", code).get();
    if (snap.empty) return NextResponse.json({ error: "Invalid team code" }, { status: 404 });

    const teamDoc = snap.docs[0];
    const team = teamDoc.data();

    if (team.status === "full") return NextResponse.json({ error: "This team is already full" }, { status: 400 });
    if (team.members.includes(uid)) return NextResponse.json({ error: "You are already in this team" }, { status: 400 });
    if (team.members.length >= 5) return NextResponse.json({ error: "This team is already full" }, { status: 400 });

    // Check not registered elsewhere
    const existing = await adminDb.collection("teams")
      .where("tournamentId", "==", team.tournamentId)
      .where("members", "array-contains", uid).get();
    if (!existing.empty) return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });

    const soloExisting = await adminDb.collection("soloPool")
      .where("tournamentId", "==", team.tournamentId)
      .where("uid", "==", uid).get();
    if (!soloExisting.empty) return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });

    // Get Steam ID and fetch rank
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    const { bracket } = await fetchAndStoreRank(uid, userData.steamId, adminDb);

    // Add member
    const newMembers = [...team.members, uid];
    const newMemberBrackets = { ...team.memberBrackets, [uid]: bracket };
    const newStatus = newMembers.length >= 5 ? "full" : "forming";

    await teamDoc.ref.update({
      members: newMembers,
      memberBrackets: newMemberBrackets,
      status: newStatus,
    });
    
    await adminDb.collection("users").doc(uid).update({ registeredTournaments: FieldValue.arrayUnion(team.tournamentId) });

    // If team full → calculate average MMR → update slots
    if (newStatus === "full") {
      const memberDocs = await Promise.all(
        newMembers.map((mUid: string) => adminDb.collection("users").doc(mUid).get())
      );
      const avgMMR = memberDocs.reduce((sum, d) => sum + (d.data()?.dotaMMR || 0), 0) / newMembers.length;
      const teamBracket = team.memberBrackets?.[team.captainUid] || bracket;

      await teamDoc.ref.update({ averageMMR: avgMMR, bracket: teamBracket });

      const tournamentRef = adminDb.collection("tournaments").doc(team.tournamentId);
      const tSnap = await tournamentRef.get();
      if (tSnap.exists) {
        const tData = tSnap.data()!;
        const newBracketBooked = (tData.brackets[teamBracket]?.slotsBooked || 0) + 5;
        const newTotalBooked = (tData.slotsBooked || 0) + 5;
        const newTStatus = newTotalBooked >= tData.totalSlots ? "Full" : "Open";
        await tournamentRef.update({
          slotsBooked: newTotalBooked,
          status: newTStatus,
          [`brackets.${teamBracket}.slotsBooked`]: newBracketBooked,
        });
      }
    }

    return NextResponse.json({ success: true, bracket });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}