import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndStoreRank } from "@/lib/opendota";
import { FieldValue } from "firebase-admin/firestore";
import { requirePaidEntry } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";


export async function POST(req: NextRequest) {
  try {
    const { code, uid } = await req.json();
    if (!code || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

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

    // Get user doc and validate mandatory fields
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.fullName) return NextResponse.json({ error: "Full name is required. Please update your profile." }, { status: 400 });
    if (!userData?.phone && !userData?.phoneNumber) return NextResponse.json({ error: "Phone number is required. Please log in with your phone number." }, { status: 400 });
    if (!userData?.discordId) return NextResponse.json({ error: "Discord account is required. Please connect Discord first." }, { status: 400 });
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    // Paid entry — every member pays for their own slot, so the tournament is
    // resolved from the team being joined rather than supplied by the caller.
    const gate = await requirePaidEntry({ game: "dota2", tournamentId: team.tournamentId, uid });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, requiresPayment: gate.requiresPayment, entryFee: gate.entryFee, tournamentId: team.tournamentId },
        { status: gate.status }
      );
    }

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

      // A full team books five slots at once. Reading the counters outside the
      // write means two teams filling at the same moment overwrite each other
      // and the tournament under-counts by five, so the whole move is one
      // transaction with the arithmetic done on the value read inside it.
      const tournamentRef = adminDb.collection("tournaments").doc(team.tournamentId);
      await adminDb.runTransaction(async (tx) => {
        const tSnap = await tx.get(tournamentRef);
        if (!tSnap.exists) return;
        const tData = tSnap.data()!;
        const newBracketBooked = (tData.brackets?.[teamBracket]?.slotsBooked || 0) + 5;
        const newTotalBooked = (tData.slotsBooked || 0) + 5;
        const newTStatus = newTotalBooked >= tData.totalSlots ? "Full" : "Open";
        tx.update(tournamentRef, {
          slotsBooked: newTotalBooked,
          status: newTStatus,
          [`brackets.${teamBracket}.slotsBooked`]: newBracketBooked,
        });
      });
    }

    return NextResponse.json({ success: true, bracket });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}