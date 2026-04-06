import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { adminDb } from "@/lib/firebaseAdmin";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

// Pre-load logos as data URIs to avoid external HTTP fetches that hang Satori
function loadLocalImage(filename: string): string {
  try {
    const filePath = join(process.cwd(), "public", filename);
    const buf = readFileSync(filePath);
    const ext = filename.endsWith(".png") ? "png" : "jpeg";
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

let cachedIeLogo = "";
let cachedValLogo = "";
function getIeLogo() { if (!cachedIeLogo) cachedIeLogo = loadLocalImage("ielogo.png"); return cachedIeLogo; }
function getValLogo() { if (!cachedValLogo) cachedValLogo = loadLocalImage("valorantlogo.png"); return cachedValLogo; }

function fmtDate(iso?: string) {
  if (!iso) return "TBD";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date}, ${time}`;
  } catch {
    return "TBD";
  }
}

function fmtDateOnly(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

const S = 1080; // canvas size

export async function GET(req: NextRequest) {
  try {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  const type = searchParams.get("type") || "overview";
  const game = searchParams.get("game") || "valorant";
  const collectionName = game === "dota2" ? "tournaments" : "valorantTournaments";

  if (!tournamentId)
    return new Response("tournamentId required", { status: 400 });

  const snap = await adminDb
    .collection(collectionName)
    .doc(tournamentId)
    .get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const t = snap.data()!;

  const name = t.name || "Tournament";
  const schedule = t.schedule || {};
  const tagline =
    t.shareImages?.tagline || "Indian Esports Tournament Platform";
  const highlight = t.shareImages?.highlightText || "";
  const fmtLabel =
    t.format === "shuffle"
      ? "SHUFFLE"
      : t.format === "auction"
        ? "AUCTION"
        : "STANDARD";

  // ── Background image resolution ──
  const bgUrlRaw: string | undefined =
    t.shareImages?.[`${type}Bg`] || t.shareImages?.defaultBg || t.bannerImage;
  let bgSrc = "";
  if (bgUrlRaw) {
    // Pre-fetch external images and convert to data URI so Satori doesn't hang
    try {
      const url = bgUrlRaw.startsWith("/")
        ? `${process.env.NEXT_PUBLIC_APP_URL || "https://iesports.in"}${bgUrlRaw}`
        : bgUrlRaw;
      const imgRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get("content-type") || "image/jpeg";
        bgSrc = `data:${ct};base64,${buf.toString("base64")}`;
      }
    } catch {
      // If fetch fails, skip bg image — don't let it crash the route
      bgSrc = "";
    }
  }

  // ── Logo data URIs (loaded from filesystem, no HTTP fetch) ──
  const ieLogoUrl = getIeLogo();
  const valLogoUrl = getValLogo();

  // ── Graceful color palette ──
  const CL = {
    rose: "#FF4655",
    gold: "#3CCBFF",
    lavender: "#FF4655",
    sky: "#3CCBFF",
    steel: "#2A9FCC",
    sage: "#4ade80",
    amber: "#FF4655",
    cream: "rgba(255,255,255,0.55)",
    muted: "rgba(255,255,255,0.35)",
  };

  // ═══════════════════════════════════════════════
  // SHARED VISUAL BUILDING BLOCKS
  // (Satori-safe: no emoji, no CSS grid, no filter)
  // ═══════════════════════════════════════════════

  const Background = () => (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: S,
        height: S,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Base gradient — Valorant dark navy */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: S,
          height: S,
          background:
            "linear-gradient(155deg, #0A0F2A 0%, #0F1923 25%, #0A1428 50%, #0D0F1A 75%, #080C1E 100%)",
          display: "flex",
        }}
      />
      {/* Admin background image if available */}
      {bgSrc && (
        // @ts-ignore — next/og JSX
        <img
          src={bgSrc}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: S,
            height: S,
            objectFit: "cover",
          }}
        />
      )}
      {/* Dark overlay for readability */}
      {bgSrc && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: S,
            height: S,
            background:
              "linear-gradient(180deg, rgba(10,15,42,0.45) 0%, rgba(10,15,42,0.55) 60%, rgba(10,15,42,0.70) 100%)",
            display: "flex",
          }}
        />
      )}
      {/* Glow: top-left Valorant red */}
      <div
        style={{
          position: "absolute",
          top: -250,
          left: -200,
          width: 700,
          height: 700,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(255,70,85,0.18) 0%, rgba(255,70,85,0.04) 50%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Glow: bottom-right Valorant cyan */}
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -150,
          width: 600,
          height: 600,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(60,203,255,0.14) 0%, rgba(60,203,255,0.03) 50%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Glow: center-right red */}
      <div
        style={{
          position: "absolute",
          top: 350,
          right: -100,
          width: 450,
          height: 450,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(255,70,85,0.08) 0%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Dot grid — cyan tint */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: S,
          height: S,
          backgroundImage:
            "radial-gradient(rgba(60,203,255,0.06) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          display: "flex",
        }}
      />
      {/* Angular accent line top-right — Valorant red */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: -100,
          width: 500,
          height: 2,
          background:
            "linear-gradient(90deg, transparent, rgba(255,70,85,0.30), transparent)",
          transform: "rotate(-30deg)",
          display: "flex",
        }}
      />
      {/* Angular accent line bottom-left — cyan */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: -100,
          width: 400,
          height: 1.5,
          background:
            "linear-gradient(90deg, transparent, rgba(60,203,255,0.20), transparent)",
          transform: "rotate(-30deg)",
          display: "flex",
        }}
      />
    </div>
  );

  // Top bar: IESPORTS logo + VALORANT badge + type label
  const TopBar = ({ label }: { label: string }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "52px 60px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* iEsports shield logo */}
        {/* @ts-ignore — next/og JSX */}
        <img
          src={ieLogoUrl}
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            objectFit: "contain",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "0.08em",
              lineHeight: 1,
              display: "flex",
            }}
          >
            IESPORTS
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: CL.muted,
              letterSpacing: "0.15em",
              display: "flex",
            }}
          >
            iesports.in
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* VALORANT badge with logo */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.15em",
            padding: "8px 18px",
            background: "rgba(255,70,85,0.10)",
            border: "1px solid rgba(255,70,85,0.25)",
            borderRadius: 100,
            color: CL.rose,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* @ts-ignore — next/og JSX */}
          <img src={valLogoUrl} style={{ width: 16, height: 16 }} />
          VALORANT
        </div>
        {/* Type label */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.12em",
            padding: "8px 18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 100,
            color: CL.muted,
            display: "flex",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );

  // Bottom bar: branding + platform label
  const BottomBar = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "0 60px 52px",
        marginTop: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* @ts-ignore — next/og JSX */}
        <img
          src={ieLogoUrl}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            objectFit: "contain",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: CL.gold,
              letterSpacing: "0.04em",
              lineHeight: 1.1,
              display: "flex",
            }}
          >
            iesports.in
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: CL.muted,
              letterSpacing: "0.1em",
              display: "flex",
            }}
          >
            INDIAN ESPORTS PLATFORM
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: CL.gold,
            boxShadow: "0 0 12px rgba(200,164,78,0.5)",
            display: "flex",
          }}
        />
      </div>
    </div>
  );

  // Numbered circle (replaces emoji)
  const Num = ({
    n,
    color,
    size = 56,
  }: {
    n: string;
    color: string;
    size?: number;
  }) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: `linear-gradient(135deg, ${color}22, ${color}0A)`,
        border: `2px solid ${color}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 900,
        color: color,
        flexShrink: 0,
        boxShadow: `0 0 20px ${color}20`,
      }}
    >
      {n}
    </div>
  );

  // Stat box
  const StatBox = ({
    val,
    label,
    color,
  }: {
    val: string;
    label: string;
    color: string;
  }) => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 22,
        padding: "28px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}30, transparent)`,
          display: "flex",
        }}
      />
      <div
        style={{
          fontSize: 36,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.1,
          display: "flex",
          marginBottom: 8,
        }}
      >
        {val}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.12em",
          color: color,
          display: "flex",
        }}
      >
        {label}
      </div>
    </div>
  );

  // Stage card for format/flow
  const StageCard = ({
    num,
    title,
    sub,
    detail,
    color,
  }: {
    num: string;
    title: string;
    sub: string;
    detail: string;
    color: string;
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        background: `linear-gradient(135deg, ${color}0E, ${color}04)`,
        border: `1.5px solid ${color}35`,
        borderRadius: 22,
        padding: "28px 32px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 4,
          background: `linear-gradient(90deg, ${color}, ${color}50, transparent)`,
          display: "flex",
        }}
      />
      <Num n={num} color={color} size={64} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: color,
            letterSpacing: "0.04em",
            lineHeight: 1.2,
            display: "flex",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 20,
            color: CL.cream,
            fontWeight: 600,
            marginTop: 4,
            display: "flex",
          }}
        >
          {sub}
        </div>
        {detail && (
          <div
            style={{
              fontSize: 16,
              color: CL.muted,
              fontWeight: 500,
              marginTop: 4,
              display: "flex",
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );

  // Pill badge
  const Badge = ({ text, color }: { text: string; color: string }) => (
    <div
      style={{
        display: "flex",
        fontSize: 16,
        fontWeight: 900,
        padding: "10px 26px",
        borderRadius: 100,
        background: `linear-gradient(135deg, ${color}20, ${color}08)`,
        border: `1.5px solid ${color}50`,
        color: color,
        letterSpacing: "0.1em",
        boxShadow: `0 0 24px ${color}15`,
      }}
    >
      {text}
    </div>
  );

  // ═══════════════════════════════════════════════
  // CARD CONTENT — each fills the full middle area
  // ═══════════════════════════════════════════════

  let content;

  if (type === "overview") {
    // ── CARD 1: TOURNAMENT OVERVIEW (hero card) ──
    const hasPrize = t.prizePool && t.prizePool !== "0";
    const prizeDisplay = hasPrize
      ? String(t.prizePool).replace(/^Rs\.?\s?/, "Rs.")
      : "";

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Format badge */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <Badge text={fmtLabel} color={CL.rose} />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            display: "flex",
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          {name}
        </div>

        {/* Tagline / highlight */}
        <div
          style={{
            fontSize: 24,
            color: CL.cream,
            fontWeight: 500,
            display: "flex",
            marginBottom: 40,
            lineHeight: 1.4,
            textAlign: "center",
          }}
        >
          {highlight || tagline}
        </div>

        {/* Prize Pool & Entry Fee — hero boxes */}
        <div style={{ display: "flex", gap: 18, marginBottom: 32, width: "100%" }}>
          {/* Entry Fee */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${CL.lavender}0A, transparent)`, border: `1.5px solid ${CL.lavender}25`, borderRadius: 22, padding: "24px 20px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: `linear-gradient(90deg, ${CL.lavender}, ${CL.lavender}30, transparent)`, display: "flex" }} />
            <div style={{ fontSize: 44, fontWeight: 900, color: CL.lavender, lineHeight: 1, display: "flex" }}>
              {t.entryFee === 0 ? "FREE" : `Rs.${t.entryFee}`}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: CL.muted, marginTop: 8, display: "flex" }}>ENTRY FEE</div>
          </div>
          {/* Prize Pool */}
          {hasPrize && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${CL.gold}0C, transparent)`, border: `1.5px solid ${CL.gold}30`, borderRadius: 22, padding: "24px 20px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: `linear-gradient(90deg, ${CL.gold}, ${CL.gold}30, transparent)`, display: "flex" }} />
              <div style={{ fontSize: 44, fontWeight: 900, color: CL.gold, lineHeight: 1, display: "flex" }}>
                {prizeDisplay}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: CL.muted, marginTop: 8, display: "flex" }}>PRIZE POOL</div>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16, width: "100%" }}>
          <StatBox
            val={`${t.totalSlots || "?"}`}
            label="PLAYERS"
            color={CL.rose}
          />
          <StatBox
            val={fmtDateOnly(t.schedule?.groupStageStart || t.startDate)}
            label="STARTS"
            color={CL.sky}
          />
          <StatBox
            val={fmtDateOnly(t.endDate || t.registrationDeadline)}
            label="ENDS"
            color={CL.lavender}
          />
          <StatBox
            val={`${t.totalTeams || "?"}`}
            label="TEAMS"
            color={CL.sage}
          />
        </div>
      </div>
    );
  } else if (type === "register") {
    // ── CARD 2: HOW TO REGISTER ──
    const steps = [
      {
        n: "1",
        title: "Sign Up on iesports.in",
        desc: "Create your account using Discord or Steam",
        color: CL.sky,
      },
      {
        n: "2",
        title: "Connect Your Riot ID",
        desc: "Link your Valorant account so we can verify your rank",
        color: CL.lavender,
      },
      {
        n: "3",
        title: "Register for Tournament",
        desc: `Find "${name}" and hit Register — takes 10 seconds`,
        color: CL.rose,
      },
    ];

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Tournament name — smaller, golden */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "0.06em",
            marginBottom: 12,
            display: "flex",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        {/* Primary heading */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#F0B232",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 8,
            display: "flex",
            textAlign: "center",
          }}
        >
          How to Register
        </div>
        <div
          style={{
            fontSize: 20,
            color: CL.muted,
            marginBottom: 36,
            display: "flex",
            textAlign: "center",
          }}
        >
          Solo registration. 3 simple steps. Completely free.
        </div>

        {/* Steps */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            marginBottom: 40,
            width: "100%",
          }}
        >
          {steps.map((s) => (
            <div
              key={s.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                background: `linear-gradient(135deg, ${s.color}0C, transparent)`,
                border: `1.5px solid ${s.color}30`,
                borderRadius: 22,
                padding: "24px 28px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 5,
                  height: "100%",
                  background: s.color,
                  display: "flex",
                }}
              />
              <Num n={s.n} color={s.color} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: "#fff",
                    display: "flex",
                    marginBottom: 4,
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: CL.cream,
                    lineHeight: 1.4,
                    display: "flex",
                  }}
                >
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 32px",
            width: "100%",
            background:
              "linear-gradient(135deg, rgba(224,86,114,0.14), rgba(224,86,114,0.05))",
            border: "2px solid rgba(224,86,114,0.35)",
            borderRadius: 22,
            boxShadow: "0 0 40px rgba(224,86,114,0.10)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 15,
                color: CL.cream,
                fontWeight: 600,
                display: "flex",
              }}
            >
              Registration closes
            </div>
            <div
              style={{
                fontSize: 26,
                color: CL.rose,
                fontWeight: 900,
                display: "flex",
              }}
            >
              {fmtDateOnly(t.registrationDeadline)}
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#fff",
              padding: "14px 36px",
              background: `linear-gradient(135deg, ${CL.rose}, #b8404e)`,
              borderRadius: 100,
              boxShadow: "0 4px 24px rgba(224,86,114,0.45)",
              display: "flex",
            }}
          >
            Register Now
          </div>
        </div>

        {/* Discord note */}
        <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: CL.muted, display: "flex", justifyContent: "center", letterSpacing: "0.04em" }}>
          All tournament communication happens on Discord
        </div>
      </div>
    );
  } else if (type === "teams") {
    // ── CARD 3: TEAM STRUCTURE ──
    const formatDesc =
      t.format === "shuffle"
        ? "Balanced snake draft by rank"
        : t.format === "auction"
          ? "Captain auction with rank-weighted budgets"
          : "Pre-formed teams";

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Tournament name — smaller, golden */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "0.06em",
            marginBottom: 12,
            display: "flex",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        {/* Primary heading */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#F0B232",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 44,
            display: "flex",
            textAlign: "center",
          }}
        >
          Team Structure
        </div>

        {/* Big stats */}
        <div style={{ display: "flex", gap: 18, marginBottom: 44, width: "100%" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `linear-gradient(160deg, rgba(224,86,114,0.08), transparent)`,
              border: "1.5px solid rgba(224,86,114,0.25)",
              borderRadius: 26,
              padding: "36px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "25%",
                width: "50%",
                height: 4,
                background:
                  `linear-gradient(90deg, transparent, ${CL.rose}, transparent)`,
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: CL.rose,
                display: "flex",
                lineHeight: 1,
              }}
            >
              {t.totalTeams || "?"}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: CL.muted,
                letterSpacing: "0.12em",
                marginTop: 10,
                display: "flex",
              }}
            >
              TEAMS
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `linear-gradient(160deg, rgba(138,124,191,0.08), transparent)`,
              border: "1.5px solid rgba(138,124,191,0.25)",
              borderRadius: 26,
              padding: "36px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "25%",
                width: "50%",
                height: 4,
                background:
                  `linear-gradient(90deg, transparent, ${CL.lavender}, transparent)`,
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: CL.lavender,
                display: "flex",
                lineHeight: 1,
              }}
            >
              {t.playersPerTeam || 5}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: CL.muted,
                letterSpacing: "0.12em",
                marginTop: 10,
                display: "flex",
              }}
            >
              PER TEAM
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `linear-gradient(160deg, rgba(96,165,250,0.08), transparent)`,
              border: "1.5px solid rgba(96,165,250,0.25)",
              borderRadius: 26,
              padding: "36px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "25%",
                width: "50%",
                height: 4,
                background:
                  `linear-gradient(90deg, transparent, ${CL.sky}, transparent)`,
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: CL.sky,
                display: "flex",
                lineHeight: 1,
              }}
            >
              {(t.totalTeams || 0) * (t.playersPerTeam || 5) || "?"}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: CL.muted,
                letterSpacing: "0.12em",
                marginTop: 10,
                display: "flex",
              }}
            >
              TOTAL PLAYERS
            </div>
          </div>
        </div>

        {/* Format card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 22,
            padding: "28px 36px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: 4,
              background:
                `linear-gradient(90deg, ${CL.rose}, ${CL.lavender}, ${CL.sky})`,
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: CL.muted,
              letterSpacing: "0.15em",
              marginBottom: 12,
              display: "flex",
            }}
          >
            TEAM FORMATION
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: CL.rose,
                display: "flex",
              }}
            >
              {fmtLabel}
            </div>
            <div
              style={{
                width: 2,
                height: 30,
                background: "rgba(255,255,255,0.10)",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: CL.cream,
                display: "flex",
              }}
            >
              {formatDesc}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (type === "ranks") {
    // ── CARD: RANKS & MAPS ──
    const minRank = t.eligibility?.minRank || "Gold";
    const maxRank = t.eligibility?.maxRank || "Immortal";
    const COMP_MAPS = ["Bind", "Breeze", "Fracture", "Haven", "Lotus", "Pearl", "Split"];
    const groupPool = t.mapPool?.groupStage || "All Maps [Random]";
    const bracketPool = t.mapPool?.tourneyStage || "Competitive Maps [Veto]";

    // Valorant rank tier colors
    const RANK_TIERS = [
      { name: "Iron", color: "#6b6b6b" },
      { name: "Bronze", color: "#a0522d" },
      { name: "Silver", color: "#b0b0b0" },
      { name: "Gold", color: "#e8b731" },
      { name: "Platinum", color: "#2dd4bf" },
      { name: "Diamond", color: "#b370d4" },
      { name: "Ascendant", color: "#2dd45b" },
      { name: "Immortal", color: "#e05672" },
      { name: "Radiant", color: "#f5e642" },
    ];

    const getBaseRank = (r: string) => RANK_TIERS.find(rt => r.toLowerCase().startsWith(rt.name.toLowerCase()))?.name || r;
    const minBase = getBaseRank(minRank);
    const maxBase = getBaseRank(maxRank);
    const minIdx = RANK_TIERS.findIndex(rt => rt.name === minBase);
    const maxIdx = RANK_TIERS.findIndex(rt => rt.name === maxBase);
    const ranksInRange = RANK_TIERS.slice(Math.max(0, minIdx), maxIdx + 1);
    const minColor = RANK_TIERS.find(rt => rt.name === minBase)?.color || CL.gold;
    const maxColor = RANK_TIERS.find(rt => rt.name === maxBase)?.color || CL.rose;

    content = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "36px 60px", justifyContent: "center", alignItems: "center" }}>
        {/* Tournament name — smaller, golden */}
        <div style={{ fontSize: 22, fontWeight: 800, color: "#F0B232", letterSpacing: "0.06em", marginBottom: 16, display: "flex", textAlign: "center" }}>
          {name}
        </div>
        {/* Primary heading */}
        <div style={{ fontSize: 48, fontWeight: 900, color: "#F0B232", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 32, display: "flex", textAlign: "center" }}>
          Eligible Ranks & Maps
        </div>

        {/* Eligible Rank Bars Only */}
        <div style={{ display: "flex", flexDirection: "column", padding: "32px 32px", width: "100%", background: `linear-gradient(135deg, ${minColor}0C, ${maxColor}0C, transparent)`, border: `1.5px solid ${maxColor}30`, borderRadius: 24, marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            {ranksInRange.map((rank) => (
              <div key={rank.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: "100%", height: 48, borderRadius: 10, background: `linear-gradient(180deg, ${rank.color}, ${rank.color}BB)`, boxShadow: `0 0 28px ${rank.color}60`, border: `2.5px solid ${rank.color}`, display: "flex" }} />
                <div style={{ fontSize: 13, fontWeight: 900, color: rank.color, letterSpacing: "0.08em", display: "flex" }}>{rank.name.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Competitive maps */}
        <div style={{ display: "flex", flexDirection: "column", padding: "24px 28px", width: "100%", background: `linear-gradient(135deg, ${CL.sky}0C, transparent)`, border: `1.5px solid ${CL.sky}30`, borderRadius: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: CL.muted, letterSpacing: "0.1em", marginBottom: 12, display: "flex" }}>COMPETITIVE MAP POOL</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {COMP_MAPS.map((m) => (
              <div key={m} style={{ padding: "8px 20px", background: `${CL.sky}18`, border: `1px solid ${CL.sky}30`, borderRadius: 100, fontSize: 18, fontWeight: 800, color: "#fff", display: "flex" }}>{m}</div>
            ))}
          </div>
        </div>

        {/* Map pool rules */}
        <div style={{ display: "flex", gap: 16, width: "100%" }}>
          <div style={{ flex: 1, padding: "20px 22px", background: `${CL.steel}0C`, border: `1px solid ${CL.steel}25`, borderRadius: 16, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CL.muted, letterSpacing: "0.08em", marginBottom: 8, display: "flex" }}>GROUP STAGE FORMAT</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: CL.steel, display: "flex" }}>{groupPool}</div>
          </div>
          <div style={{ flex: 1, padding: "20px 22px", background: `${CL.amber}0C`, border: `1px solid ${CL.amber}25`, borderRadius: 16, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: CL.muted, letterSpacing: "0.08em", marginBottom: 8, display: "flex" }}>PLAY-OFF FORMAT</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: CL.amber, display: "flex" }}>{bracketPool}</div>
          </div>
        </div>
      </div>
    );
  } else if (type === "schedule") {
    // ── CARD: SCHEDULE ──
    const events = [
      {
        lbl: "Registration Opens",
        date: schedule.registrationOpens,
        color: CL.sage,
        n: "1",
      },
      {
        lbl: "Registration Closes",
        date: schedule.registrationCloses || t.registrationDeadline,
        color: CL.amber,
        n: "2",
      },
      {
        lbl: "Team Formation",
        date: schedule.squadCreation,
        color: CL.lavender,
        n: "3",
      },
      {
        lbl: "Group Stage Starts",
        date: schedule.groupStageStart || t.startDate,
        color: CL.steel,
        n: "4",
      },
      {
        lbl: "Play-off Stage",
        date: schedule.tourneyStageStart,
        color: CL.amber,
        n: "5",
      },
      {
        lbl: "Tournament Ends",
        date: t.endDate,
        color: CL.rose,
        n: "6",
      },
    ].filter((e) => e.date);

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "36px 60px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Tournament name — smaller, golden */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "0.06em",
            marginBottom: 12,
            display: "flex",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        {/* Primary heading */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#F0B232",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 40,
            display: "flex",
            textAlign: "center",
          }}
        >
          Schedule
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          {events.slice(0, 7).map((e) => (
            <div
              key={e.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "18px 24px",
                background: `linear-gradient(135deg, ${e.color}0A, transparent)`,
                border: `1px solid ${e.color}22`,
                borderRadius: 18,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 5,
                  height: "100%",
                  background: e.color,
                  display: "flex",
                }}
              />
              <Num n={e.n} color={e.color} size={44} />
              <div
                style={{
                  flex: 1,
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#fff",
                  display: "flex",
                }}
              >
                {e.lbl}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: e.color,
                  display: "flex",
                }}
              >
                {fmtDateOnly(e.date)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (type === "format") {
    // ── CARD 5: COMBINED FORMAT & FLOW ──
    const accentColor = CL.sky;
    const formatSteps = [
      { n: "1", lbl: "Register", sub: "Sign up on iesports.in  /  Connect Riot ID", date: schedule.registrationOpens || t.registrationDeadline, color: accentColor },
      { n: "2", lbl: "Team Formation", sub: `${fmtLabel} format  /  ${t.playersPerTeam || 5}v${t.playersPerTeam || 5}`, date: schedule.squadCreation, color: accentColor },
      { n: "3", lbl: "Group Stage", sub: `Swiss  /  BO${t.matchesPerRound || 2}`, date: schedule.groupStageStart || t.startDate, color: accentColor },
      { n: "4", lbl: "Play-off Stage", sub: `${t.bracketFormat === "single_elimination" ? "Single" : "Double"} Elimination  /  BO${t.bracketBestOf || 2}`, date: schedule.tourneyStageStart, color: accentColor },
      { n: "5", lbl: "Grand Final", sub: `Best of ${t.grandFinalBestOf || 3}  /  Champion crowned`, date: t.endDate, color: accentColor },
    ];

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "36px 60px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Tournament name — smaller, golden */}
        <div style={{ fontSize: 22, fontWeight: 800, color: "#F0B232", letterSpacing: "0.06em", marginBottom: 12, display: "flex", textAlign: "center" }}>
          {name}
        </div>
        {/* Primary heading */}
        <div style={{ fontSize: 52, fontWeight: 900, color: "#F0B232", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 12, display: "flex", textAlign: "center" }}>
          Tournament Format
        </div>
        <div style={{ fontSize: 20, color: CL.cream, marginBottom: 36, display: "flex", textAlign: "center" }}>
          From signup to champion
        </div>

        {/* Vertical timeline */}
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {formatSteps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "stretch" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 52, flexShrink: 0 }}>
                <Num n={s.n} color={s.color} size={48} />
                {i < formatSteps.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 32, background: `linear-gradient(180deg, ${s.color}35, ${formatSteps[i + 1].color}35)`, display: "flex" }} />
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", paddingLeft: 20, paddingBottom: i < formatSteps.length - 1 ? 32 : 0, justifyContent: "center", flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, letterSpacing: "0.06em", lineHeight: 1.2, display: "flex" }}>
                  {s.lbl}
                </div>
                <div style={{ fontSize: 17, color: "#F0B232", fontWeight: 600, display: "flex" }}>
                  {s.sub}
                </div>
              </div>
              {fmtDateOnly(s.date) && (
                <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: "0.02em" }}>
                  {fmtDateOnly(s.date)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Discord note */}
        <div style={{ marginTop: 28, fontSize: 15, fontWeight: 700, color: CL.muted, display: "flex", justifyContent: "center", letterSpacing: "0.04em" }}>
          All communication via Discord
        </div>

        {/* Prize callout */}
        {t.prizePool && t.prizePool !== "0" && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "20px 32px", background: `linear-gradient(135deg, ${CL.gold}0C, ${CL.gold}04)`, border: `2px solid ${CL.gold}25`, borderRadius: 22, boxShadow: `0 0 30px ${CL.gold}08` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: CL.muted, letterSpacing: "0.12em", display: "flex" }}>PRIZE POOL</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: CL.gold, display: "flex" }}>
              {String(t.prizePool).startsWith("Rs.") ? t.prizePool : "Rs." + t.prizePool}
            </div>
          </div>
        )}
      </div>
    );
  } else {
    // ── FALLBACK ──
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#fff",
            display: "flex",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 26,
            color: CL.muted,
            marginTop: 16,
            display: "flex",
          }}
        >
          {tagline}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

  const jsx = (
    <div
      style={{
        width: S,
        height: S,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Background />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          position: "relative",
        }}
      >
        <TopBar label={type.toUpperCase()} />
        {content}
        <BottomBar />
      </div>
    </div>
  );

  try {
    const response = new ImageResponse(jsx, { width: S, height: S });
    return response;
  } catch (e: any) {
    console.error("[share-image] ImageResponse error:", e);
    return new Response(`Image generation failed: ${e.message}`, {
      status: 500,
    });
  }

  } catch (outerErr: any) {
    console.error("[share-image] Unhandled route error:", outerErr);
    return new Response(`Route error: ${outerErr.message}`, { status: 500 });
  }
}
