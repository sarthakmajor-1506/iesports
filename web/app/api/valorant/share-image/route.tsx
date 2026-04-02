import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function fmtDate(iso?: string) {
  if (!iso) return "TBD";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "TBD"; }
}

const SIZE = 1080;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  const type = searchParams.get("type") || "overview";

  if (!tournamentId) return new Response("tournamentId required", { status: 400 });

  const snap = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const t = snap.data()!;

  const name = t.name || "Tournament";
  const schedule = t.schedule || {};
  const tagline = t.shareImages?.tagline || "Indian Esports Tournament Platform";
  const fmtLabel = t.format === "shuffle" ? "Shuffle" : t.format === "auction" ? "Auction" : "Standard";

  // Background image URL resolution
  const bgUrlRaw: string | undefined =
    t.shareImages?.[`${type}Bg`] || t.shareImages?.defaultBg;
  let bgSrc = "";
  if (bgUrlRaw) {
    bgSrc = bgUrlRaw.startsWith("/")
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://iesports.in"}${bgUrlRaw}`
      : bgUrlRaw;
  }

  // Shared layout helpers
  const Bg = () => bgSrc ? (
    // @ts-ignore — next/og JSX
    <img src={bgSrc} style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, objectFit: "cover" }} />
  ) : (
    <div style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, background: "linear-gradient(145deg, #0a0f18 0%, #160814 50%, #080c12 100%)", display: "flex" }} />
  );

  const Overlay = () => (
    <div style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, background: bgSrc ? "linear-gradient(180deg, rgba(15,25,35,0.72) 0%, rgba(15,25,35,0.92) 100%)" : "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(255,70,85,0.22) 0%, transparent 70%)", display: "flex" }} />
  );

  const Grid = () => (
    <div style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, backgroundImage: "linear-gradient(rgba(255,70,85,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,70,85,0.06) 1px, transparent 1px)", backgroundSize: "80px 80px", display: "flex" }} />
  );

  const Header = ({ label }: { label: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "44px 64px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#ff4655", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: "#fff", display: "flex" }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#ff4655", letterSpacing: "0.08em" }}>IESPORTS.IN</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", padding: "6px 18px", background: "rgba(255,70,85,0.12)", border: "1px solid rgba(255,70,85,0.3)", borderRadius: 100, color: "#ff4655" }}>
        {label}
      </div>
    </div>
  );

  const Footer = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 64px 44px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#ff4655" }}>iesports.in</div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>Indian Esports Platform</div>
    </div>
  );

  let content;

  if (type === "overview") {
    const chips = [
      { txt: fmtLabel, c: "#ff4655", bg: "rgba(255,70,85,0.12)", bd: "rgba(255,70,85,0.35)" },
      { txt: t.entryFee === 0 ? "Free Entry" : `₹${t.entryFee} Entry`, c: "#ccc", bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
      ...(t.prizePool && t.prizePool !== "0" ? [{ txt: `${String(t.prizePool).startsWith("₹") ? t.prizePool : "₹" + t.prizePool} Prize`, c: "#fbbf24", bg: "rgba(251,191,36,0.1)", bd: "rgba(251,191,36,0.3)" }] : []),
    ];
    const stats = [
      { val: `${t.slotsBooked || 0}/${t.totalSlots || "?"}`, lbl: "Players" },
      { val: fmtDate(t.startDate), lbl: "Starts" },
      { val: fmtDate(t.endDate || t.registrationDeadline), lbl: "Ends" },
      { val: `${t.totalTeams || "?"} Teams`, lbl: "Structure" },
    ];
    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "32px 64px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 28 }}>
          {chips.map((c, i) => (
            <div key={i} style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 14, fontWeight: 700, padding: "6px 18px", borderRadius: 100, background: c.bg, border: `1px solid ${c.bd}`, color: c.c }}>{c.txt}</div>
          ))}
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, color: "#fff", lineHeight: 1.0, letterSpacing: "-0.03em", marginBottom: 16 }}>{name}</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.5)", marginBottom: 48 }}>{tagline}</div>
        <div style={{ display: "flex", gap: 16 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px 24px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 6 }}>{s.val}</div>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)" }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (type === "register") {
    const steps = [
      { n: "01", t: "Sign Up on iEsports.in", d: "Create your account using phone OTP or Discord login" },
      { n: "02", t: "Connect Your Riot ID", d: "Link your Valorant account for rank verification" },
      { n: "03", t: "Register for Tournament", d: `Find "${name}" and click Register` },
    ];
    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "40px 64px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.2em", color: "#ff4655", marginBottom: 16, textTransform: "uppercase" }}>HOW TO REGISTER</div>
        <div style={{ fontSize: 58, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 48 }}>Join {name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,70,85,0.15)", border: "2px solid rgba(255,70,85,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#ff4655", flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, padding: "20px 28px", background: "rgba(255,70,85,0.08)", border: "1px solid rgba(255,70,85,0.25)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 20, color: "#ff4655", fontWeight: 700 }}>Registration closes: {fmtDate(t.registrationDeadline)}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#ff4655" }}>iesports.in</div>
        </div>
      </div>
    );
  } else if (type === "teams") {
    const formatDesc = t.format === "shuffle" ? "Balanced snake draft by rank" : t.format === "auction" ? "Captain auction with rank-weighted budgets" : "Pre-formed teams";
    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "40px 64px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.2em", color: "#ff4655", marginBottom: 16, textTransform: "uppercase" }}>TEAMS</div>
        <div style={{ fontSize: 58, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 24 }}>{name}</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 40 }}>
          {[
            { val: String(t.totalTeams || "?"), lbl: "Teams" },
            { val: String(t.playersPerTeam || 5), lbl: "Players/Team" },
            { val: String((t.totalTeams || 0) * (t.playersPerTeam || 5) || "?"), lbl: "Total Players" },
          ].map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "20px 28px", flex: 1 }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#ff4655", marginBottom: 6 }}>{s.val}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "24px 32px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Team Formation</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{fmtLabel} — {formatDesc}</div>
        </div>
      </div>
    );
  } else if (type === "schedule") {
    const events = [
      { lbl: "Registration Opens", date: schedule.registrationOpens, accent: false },
      { lbl: "Registration Closes", date: schedule.registrationCloses || t.registrationDeadline, accent: false },
      { lbl: "Squad Creation", date: schedule.squadCreation, accent: false },
      { lbl: "Tournament Starts", date: t.startDate, accent: true },
      { lbl: "Group Stage", date: schedule.groupStageStart, accent: false },
      { lbl: "Bracket Stage", date: schedule.tourneyStageStart, accent: false },
      { lbl: "Tournament Ends", date: t.endDate, accent: true },
    ].filter(e => e.date);
    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "32px 64px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.2em", color: "#ff4655", marginBottom: 12, textTransform: "uppercase" }}>SCHEDULE</div>
        <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 36 }}>{name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {events.slice(0, 6).map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: e.accent ? "rgba(255,70,85,0.08)" : "rgba(255,255,255,0.03)", borderRadius: 12, border: `1px solid ${e.accent ? "rgba(255,70,85,0.2)" : "rgba(255,255,255,0.05)"}` }}>
              <div style={{ fontSize: e.accent ? 20 : 17, fontWeight: e.accent ? 900 : 600, color: e.accent ? "#ff4655" : "rgba(255,255,255,0.6)" }}>{e.lbl}</div>
              <div style={{ fontSize: e.accent ? 20 : 17, fontWeight: 800, color: e.accent ? "#fff" : "rgba(255,255,255,0.7)" }}>{fmtDate(e.date)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    // type === "format"
    const stages = [
      { lbl: "GROUP STAGE", sub: `Swiss System · BO${t.matchesPerRound || 2} · ${t.groupStageRounds || 3} Rounds · Buchholz Tiebreaker`, color: "#3b82f6" },
      { lbl: `→ Top ${t.bracketTeamCount || "50%"} → Upper Bracket  |  Bottom → Lower Bracket`, sub: "", color: "#555", isArrow: true },
      { lbl: "BRACKET STAGE", sub: `${t.bracketFormat === "single_elimination" ? "Single Elimination" : "Double Elimination"} · BO${t.bracketBestOf || 2}`, color: "#f59e0b" },
      { lbl: "GRAND FINAL", sub: `Best of ${t.grandFinalBestOf || 3} · Champion crowned`, color: "#ff4655" },
    ];
    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "36px 64px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.2em", color: "#ff4655", marginBottom: 12, textTransform: "uppercase" }}>TOURNAMENT FORMAT</div>
        <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 40 }}>{name}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stages.map((s, i) => s.isArrow ? (
            <div key={i} style={{ fontSize: 16, color: "#555550", fontWeight: 700, padding: "4px 0" }}>{s.lbl}</div>
          ) : (
            <div key={i} style={{ background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: 20, padding: "22px 28px" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, marginBottom: 8 }}>{s.lbl}</div>
              <div style={{ fontSize: 17, color: "rgba(255,255,255,0.5)" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: SIZE, height: SIZE, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
        <Bg />
        <Grid />
        <Overlay />
        {/* Glow top-left */}
        <div style={{ position: "absolute", top: -120, left: -120, width: 400, height: 400, background: "rgba(255,70,85,0.18)", borderRadius: "50%", filter: "blur(100px)", display: "flex" }} />
        {/* Glow bottom-right */}
        <div style={{ position: "absolute", bottom: -80, right: -80, width: 300, height: 300, background: "rgba(255,70,85,0.12)", borderRadius: "50%", filter: "blur(80px)", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
          <Header label={type.toUpperCase()} />
          {content}
          <Footer />
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}
