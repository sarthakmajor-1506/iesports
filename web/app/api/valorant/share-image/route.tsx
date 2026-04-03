import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function fmtDate(iso?: string) {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "TBD";
  }
}

const S = 1080; // canvas size

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  const type = searchParams.get("type") || "overview";

  if (!tournamentId)
    return new Response("tournamentId required", { status: 400 });

  const snap = await adminDb
    .collection("valorantTournaments")
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
    t.shareImages?.[`${type}Bg`] || t.shareImages?.defaultBg;
  let bgSrc = "";
  if (bgUrlRaw) {
    bgSrc = bgUrlRaw.startsWith("/")
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://iesports.in"}${bgUrlRaw}`
      : bgUrlRaw;
  }

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
      {/* Base gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: S,
          height: S,
          background:
            "linear-gradient(155deg, #08060e 0%, #140a1a 25%, #0c0814 50%, #0a0610 75%, #080510 100%)",
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
              "linear-gradient(180deg, rgba(8,6,14,0.70) 0%, rgba(8,6,14,0.88) 60%, rgba(8,6,14,0.95) 100%)",
            display: "flex",
          }}
        />
      )}
      {/* Glow: top-left red */}
      <div
        style={{
          position: "absolute",
          top: -250,
          left: -200,
          width: 700,
          height: 700,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(255,70,85,0.28) 0%, rgba(255,70,85,0.06) 50%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Glow: bottom-right purple */}
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -150,
          width: 600,
          height: 600,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(120,60,200,0.18) 0%, rgba(120,60,200,0.04) 50%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Glow: center-right blue */}
      <div
        style={{
          position: "absolute",
          top: 350,
          right: -100,
          width: 450,
          height: 450,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
          display: "flex",
        }}
      />
      {/* Dot grid */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: S,
          height: S,
          backgroundImage:
            "radial-gradient(rgba(255,70,85,0.10) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          display: "flex",
        }}
      />
      {/* Angular accent line top-right */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: -100,
          width: 500,
          height: 3,
          background:
            "linear-gradient(90deg, transparent, rgba(255,70,85,0.45), transparent)",
          transform: "rotate(-30deg)",
          display: "flex",
        }}
      />
      {/* Angular accent line bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: -100,
          width: 400,
          height: 2,
          background:
            "linear-gradient(90deg, transparent, rgba(255,70,85,0.25), transparent)",
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
        {/* Logo square */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: "linear-gradient(135deg, #ff4655, #e02030)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 28px rgba(255,70,85,0.5)",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "#fff",
              display: "flex",
            }}
          />
        </div>
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
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.15em",
              display: "flex",
            }}
          >
            iesports.in
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* VALORANT badge */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.15em",
            padding: "8px 18px",
            background: "rgba(255,70,85,0.10)",
            border: "1px solid rgba(255,70,85,0.30)",
            borderRadius: 100,
            color: "#ff4655",
            display: "flex",
          }}
        >
          VALORANT
        </div>
        {/* Type label */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.12em",
            padding: "8px 18px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 100,
            color: "rgba(255,255,255,0.60)",
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 5,
            height: 32,
            borderRadius: 6,
            background: "linear-gradient(180deg, #ff4655, #e02030)",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "#ff4655",
              letterSpacing: "0.04em",
              lineHeight: 1.1,
              display: "flex",
            }}
          >
            iesports.in
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,255,255,0.30)",
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
            background: "#ff4655",
            boxShadow: "0 0 12px rgba(255,70,85,0.6)",
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
        background: `linear-gradient(135deg, ${color}30, ${color}10)`,
        border: `2.5px solid ${color}60`,
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
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
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
          height: 4,
          background: `linear-gradient(90deg, ${color}, ${color}40, transparent)`,
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
            color: "rgba(255,255,255,0.60)",
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
              color: "rgba(255,255,255,0.30)",
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
    const entryText =
      t.entryFee === 0 ? "FREE ENTRY" : `Rs.${t.entryFee} ENTRY`;
    const prizeText =
      t.prizePool && t.prizePool !== "0"
        ? `${String(t.prizePool).startsWith("Rs.") ? t.prizePool : "Rs." + t.prizePool} PRIZE`
        : "";

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px",
          justifyContent: "center",
        }}
      >
        {/* Badges row */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          <Badge text={fmtLabel} color="#ff4655" />
          <Badge text={entryText} color="#8b5cf6" />
          {prizeText && <Badge text={prizeText} color="#fbbf24" />}
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
            marginBottom: 16,
          }}
        >
          {name}
        </div>

        {/* Tagline / highlight */}
        <div
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 500,
            display: "flex",
            marginBottom: 52,
            lineHeight: 1.4,
          }}
        >
          {highlight || tagline}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16 }}>
          <StatBox
            val={`${t.slotsBooked || 0}/${t.totalSlots || "?"}`}
            label="PLAYERS"
            color="#ff4655"
          />
          <StatBox
            val={fmtDate(t.startDate)}
            label="STARTS"
            color="#60a5fa"
          />
          <StatBox
            val={fmtDate(t.endDate || t.registrationDeadline)}
            label="ENDS"
            color="#8b5cf6"
          />
          <StatBox
            val={`${t.totalTeams || "?"}`}
            label="TEAMS"
            color="#22c55e"
          />
        </div>
      </div>
    );
  } else if (type === "register") {
    // ── CARD 2: HOW TO REGISTER ──
    const steps = [
      {
        n: "1",
        title: "Sign Up on iEsports.in",
        desc: "Create your free account using phone OTP or Discord login",
        color: "#60a5fa",
      },
      {
        n: "2",
        title: "Connect Your Riot ID",
        desc: "Link your Valorant account so we can verify your rank",
        color: "#8b5cf6",
      },
      {
        n: "3",
        title: "Register for Tournament",
        desc: `Find "${name}" and hit Register — takes 10 seconds`,
        color: "#ff4655",
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
        }}
      >
        <Badge text="HOW TO REGISTER" color="#ff4655" />
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: 28,
            marginBottom: 12,
            display: "flex",
          }}
        >
          Join {name}
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.40)",
            marginBottom: 44,
            display: "flex",
          }}
        >
          3 simple steps. Under 2 minutes. Completely free.
        </div>

        {/* Steps */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            marginBottom: 40,
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
                    color: "rgba(255,255,255,0.45)",
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
            background:
              "linear-gradient(135deg, rgba(255,70,85,0.14), rgba(255,70,85,0.05))",
            border: "2px solid rgba(255,70,85,0.35)",
            borderRadius: 22,
            boxShadow: "0 0 40px rgba(255,70,85,0.10)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 15,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 600,
                display: "flex",
              }}
            >
              Registration closes
            </div>
            <div
              style={{
                fontSize: 26,
                color: "#ff4655",
                fontWeight: 900,
                display: "flex",
              }}
            >
              {fmtDate(t.registrationDeadline)}
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#fff",
              padding: "14px 36px",
              background: "linear-gradient(135deg, #ff4655, #c62c3a)",
              borderRadius: 100,
              boxShadow: "0 4px 24px rgba(255,70,85,0.45)",
              display: "flex",
            }}
          >
            Register Now
          </div>
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
        }}
      >
        <Badge text="TEAM STRUCTURE" color="#8b5cf6" />
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: 28,
            marginBottom: 48,
            display: "flex",
          }}
        >
          {name}
        </div>

        {/* Big stats */}
        <div style={{ display: "flex", gap: 18, marginBottom: 40 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `linear-gradient(160deg, rgba(255,70,85,0.08), transparent)`,
              border: "1.5px solid rgba(255,70,85,0.25)",
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
                  "linear-gradient(90deg, transparent, #ff4655, transparent)",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "#ff4655",
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
                color: "rgba(255,255,255,0.40)",
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
              background: `linear-gradient(160deg, rgba(139,92,246,0.08), transparent)`,
              border: "1.5px solid rgba(139,92,246,0.25)",
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
                  "linear-gradient(90deg, transparent, #8b5cf6, transparent)",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "#8b5cf6",
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
                color: "rgba(255,255,255,0.40)",
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
                  "linear-gradient(90deg, transparent, #60a5fa, transparent)",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: "#60a5fa",
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
                color: "rgba(255,255,255,0.40)",
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
                "linear-gradient(90deg, #ff4655, #8b5cf6, #60a5fa)",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "rgba(255,255,255,0.30)",
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
                color: "#ff4655",
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
                color: "rgba(255,255,255,0.50)",
                display: "flex",
              }}
            >
              {formatDesc}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (type === "schedule") {
    // ── CARD 4: SCHEDULE ──
    const events = [
      {
        lbl: "Registration Opens",
        date: schedule.registrationOpens,
        color: "#22c55e",
        n: "1",
      },
      {
        lbl: "Registration Closes",
        date: schedule.registrationCloses || t.registrationDeadline,
        color: "#f59e0b",
        n: "2",
      },
      {
        lbl: "Squad Creation",
        date: schedule.squadCreation,
        color: "#8b5cf6",
        n: "3",
      },
      {
        lbl: "Tournament Starts",
        date: t.startDate,
        color: "#ff4655",
        n: "4",
      },
      {
        lbl: "Group Stage",
        date: schedule.groupStageStart,
        color: "#3b82f6",
        n: "5",
      },
      {
        lbl: "Bracket Stage",
        date: schedule.tourneyStageStart,
        color: "#f59e0b",
        n: "6",
      },
      {
        lbl: "Tournament Ends",
        date: t.endDate,
        color: "#ff4655",
        n: "7",
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
        }}
      >
        <Badge text="SCHEDULE" color="#60a5fa" />
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: 24,
            marginBottom: 40,
            display: "flex",
          }}
        >
          {name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                {fmtDate(e.date)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (type === "format") {
    // ── CARD 5: TOURNAMENT FORMAT ──
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "36px 60px",
          justifyContent: "center",
        }}
      >
        <Badge text="TOURNAMENT FORMAT" color="#f59e0b" />
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: 24,
            marginBottom: 44,
            display: "flex",
          }}
        >
          {name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <StageCard
            num="1"
            title="GROUP STAGE"
            sub={`Swiss System  /  BO${t.matchesPerRound || 2}  /  ${t.groupStageRounds || 3} Rounds`}
            detail="Buchholz Tiebreaker"
            color="#3b82f6"
          />
          {/* Arrow */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 3,
                height: 20,
                background:
                  "linear-gradient(180deg, rgba(59,130,246,0.4), rgba(245,158,11,0.4))",
                display: "flex",
              }}
            />
          </div>
          <StageCard
            num="2"
            title="BRACKET STAGE"
            sub={`${t.bracketFormat === "single_elimination" ? "Single Elimination" : "Double Elimination"}  /  BO${t.bracketBestOf || 2}`}
            detail={`Top ${t.bracketTeamCount || "50%"} advance`}
            color="#f59e0b"
          />
          {/* Arrow */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 3,
                height: 20,
                background:
                  "linear-gradient(180deg, rgba(245,158,11,0.4), rgba(255,70,85,0.4))",
                display: "flex",
              }}
            />
          </div>
          <StageCard
            num="3"
            title="GRAND FINAL"
            sub={`Best of ${t.grandFinalBestOf || 3}  /  Champion crowned`}
            detail="Winner takes all"
            color="#ff4655"
          />
        </div>
      </div>
    );
  } else if (type === "flow") {
    // ── CARD 6: TOURNAMENT FLOW (journey) ──
    const flowSteps = [
      {
        n: "1",
        lbl: "REGISTER",
        sub: "Sign up and connect Riot ID",
        color: "#22c55e",
      },
      {
        n: "2",
        lbl: "TEAMS FORMED",
        sub: `${fmtLabel} format  /  ${t.playersPerTeam || 5}v${t.playersPerTeam || 5}`,
        color: "#8b5cf6",
      },
      {
        n: "3",
        lbl: "GROUP STAGE",
        sub: `Swiss  /  ${t.groupStageRounds || 3} rounds  /  BO${t.matchesPerRound || 2}`,
        color: "#3b82f6",
      },
      {
        n: "4",
        lbl: "BRACKETS",
        sub: `${t.bracketFormat === "single_elimination" ? "Single" : "Double"} Elim  /  BO${t.bracketBestOf || 2}`,
        color: "#f59e0b",
      },
      {
        n: "5",
        lbl: "GRAND FINAL",
        sub: `BO${t.grandFinalBestOf || 3}  /  Champion crowned`,
        color: "#ff4655",
      },
    ];

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "36px 60px",
          justifyContent: "center",
        }}
      >
        <Badge text="TOURNAMENT FLOW" color="#22c55e" />
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginTop: 24,
            marginBottom: 12,
            display: "flex",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.40)",
            marginBottom: 40,
            display: "flex",
          }}
        >
          From signup to champion
        </div>

        {/* Vertical timeline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {flowSteps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "stretch" }}>
              {/* Timeline rail */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 52,
                  flexShrink: 0,
                }}
              >
                <Num n={s.n} color={s.color} size={48} />
                {i < flowSteps.length - 1 && (
                  <div
                    style={{
                      width: 3,
                      flex: 1,
                      minHeight: 14,
                      background: `linear-gradient(180deg, ${s.color}50, ${flowSteps[i + 1].color}50)`,
                      display: "flex",
                    }}
                  />
                )}
              </div>
              {/* Content */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  paddingLeft: 20,
                  paddingBottom: i < flowSteps.length - 1 ? 10 : 0,
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: s.color,
                    letterSpacing: "0.06em",
                    lineHeight: 1.2,
                    display: "flex",
                  }}
                >
                  {s.lbl}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: "rgba(255,255,255,0.45)",
                    fontWeight: 500,
                    display: "flex",
                  }}
                >
                  {s.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Prize callout */}
        {t.prizePool && t.prizePool !== "0" && (
          <div
            style={{
              marginTop: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              padding: "24px 32px",
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))",
              border: "2px solid rgba(251,191,36,0.35)",
              borderRadius: 22,
              boxShadow: "0 0 36px rgba(251,191,36,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "rgba(255,255,255,0.40)",
                letterSpacing: "0.12em",
                display: "flex",
              }}
            >
              PRIZE POOL
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: "#fbbf24",
                display: "flex",
              }}
            >
              {String(t.prizePool).startsWith("Rs.")
                ? t.prizePool
                : "Rs." + t.prizePool}
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
            color: "rgba(255,255,255,0.40)",
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

  try {
    return new ImageResponse(
      (
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
      ),
      { width: S, height: S },
    );
  } catch (e: any) {
    return new Response(`Image generation failed: ${e.message}`, {
      status: 500,
    });
  }
}
