"use client";

const GAME_THEMES: Record<string, { color: string; bg: string; colorRgb: string }> = {
  dota:     { color: "#A12B1F", bg: "#0a0e18", colorRgb: "161,43,31" },
  valorant: { color: "#3CCBFF", bg: "#0A0F2A", colorRgb: "60,203,255" },
  cs2:      { color: "#f0a500", bg: "#0A0F2A", colorRgb: "240,165,0" },
  solo:     { color: "#3B82F6", bg: "#0a0e18", colorRgb: "59,130,246" },
};

const LOADER_KEYFRAMES = `
  @keyframes tl-orbit1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes tl-orbit2 { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
  @keyframes tl-orbit3 { from { transform: rotate(45deg); } to { transform: rotate(405deg); } }
  @keyframes tl-pulse { 0%,100% { opacity: 0.4; transform: scale(0.92); } 50% { opacity: 1; transform: scale(1.08); } }
  @keyframes tl-glow { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
  @keyframes tl-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes tl-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes tl-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
  @keyframes tl-bar { 0% { width: 0%; } 50% { width: 70%; } 80% { width: 85%; } 100% { width: 92%; } }
  @keyframes tl-border-glow { 0%,100% { border-color: rgba(var(--tl-rgb), 0.06); } 50% { border-color: rgba(var(--tl-rgb), 0.2); } }
  @keyframes tl-particle1 { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(60px, -80px) scale(0); opacity: 0; } }
  @keyframes tl-particle2 { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-70px, -60px) scale(0); opacity: 0; } }
  @keyframes tl-particle3 { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(50px, 70px) scale(0); opacity: 0; } }
  @keyframes tl-particle4 { 0% { transform: translate(0, 0) scale(1); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-55px, 65px) scale(0); opacity: 0; } }
`;

function OrbitalRings({ color, colorRgb, size = 120 }: { color: string; colorRgb: string; size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Outer ring */}
      <div style={{
        position: "absolute", inset: 0,
        border: `2px solid rgba(${colorRgb}, 0.1)`,
        borderTopColor: color,
        borderRightColor: `rgba(${colorRgb}, 0.4)`,
        borderRadius: "50%",
        animation: "tl-orbit1 2.4s linear infinite",
      }} />
      {/* Middle ring */}
      <div style={{
        position: "absolute", inset: size * 0.13,
        border: `2px solid rgba(${colorRgb}, 0.08)`,
        borderBottomColor: color,
        borderLeftColor: `rgba(${colorRgb}, 0.3)`,
        borderRadius: "50%",
        animation: "tl-orbit2 1.8s linear infinite",
      }} />
      {/* Inner ring */}
      <div style={{
        position: "absolute", inset: size * 0.26,
        border: `1.5px solid rgba(${colorRgb}, 0.06)`,
        borderTopColor: `rgba(${colorRgb}, 0.6)`,
        borderRadius: "50%",
        animation: "tl-orbit3 2.1s linear infinite",
      }} />
      {/* Center glow */}
      <div style={{
        position: "absolute", inset: size * 0.35,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}, rgba(${colorRgb}, 0.15), transparent)`,
        animation: "tl-pulse 2s ease-in-out infinite",
        filter: `blur(${size * 0.04}px)`,
      }} />
      {/* Center dot */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: size * 0.08, height: size * 0.08,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 ${size * 0.15}px ${color}, 0 0 ${size * 0.3}px rgba(${colorRgb}, 0.3)`,
      }} />
      {/* Particles */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: 4, height: 4,
          borderRadius: "50%",
          background: color,
          opacity: 0,
          animation: `tl-particle${i} ${1.8 + i * 0.3}s ease-out infinite`,
          animationDelay: `${i * 0.4}s`,
        }} />
      ))}
    </div>
  );
}

export function TournamentDetailLoader({ game = "dota" }: { game?: string }) {
  const theme = GAME_THEMES[game] || GAME_THEMES.dota;
  const { color, bg, colorRgb } = theme;
  const skCls = `tl-sk-${game}`;
  const skDarkCls = `tl-skd-${game}`;

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`
        ${LOADER_KEYFRAMES}
        .${skCls} { background: linear-gradient(90deg, rgba(${colorRgb},0.03) 0%, rgba(${colorRgb},0.12) 40%, rgba(${colorRgb},0.03) 80%); background-size: 200% 100%; animation: tl-shimmer 2s ease-in-out infinite; border-radius: 10px; }
        .${skDarkCls} { background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(${colorRgb},0.06) 40%, rgba(255,255,255,0.02) 80%); background-size: 200% 100%; animation: tl-shimmer 2s ease-in-out infinite; border-radius: 10px; }
      `}</style>

      {/* Navbar placeholder */}
      <div style={{ height: 62, background: "rgba(10,10,12,0.97)", borderBottom: `1px solid rgba(${colorRgb},0.12)` }} />

      {/* Hero with animated center */}
      <div style={{ height: 460, background: `linear-gradient(160deg, rgba(${colorRgb},0.08) 0%, ${bg} 60%)`, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Grid overlay */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${colorRgb},0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(${colorRgb},0.03) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />
        {/* Ambient glow behind rings */}
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, rgba(${colorRgb},0.08), transparent 70%)`, animation: "tl-glow 3s ease-in-out infinite" }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <OrbitalRings color={color} colorRgb={colorRgb} size={120} />

          {/* Loading text */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.25em", textTransform: "uppercase", color: `rgba(${colorRgb},0.7)`, marginBottom: 10 }}>
              Loading Tournament
            </div>
            {/* Progress bar */}
            <div style={{ width: 200, height: 3, background: `rgba(${colorRgb},0.1)`, borderRadius: 100, overflow: "hidden" }}>
              <div style={{ height: "100%", background: `linear-gradient(90deg, ${color}, rgba(${colorRgb},0.4))`, borderRadius: 100, animation: "tl-bar 2.5s ease-out infinite" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 30px" }}>
        {/* Tab bar skeleton */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 6, margin: "20px 0 24px", display: "flex", gap: 6, overflow: "hidden" }}>
          {[120, 100, 90, 110, 100, 105, 120].map((w, i) => (
            <div key={i} className={skDarkCls} style={{ width: w, height: 46, borderRadius: 12, flexShrink: 0, animation: `tl-shimmer 2s ease-in-out infinite, tl-fade-up 0.5s ease ${0.6 + i * 0.05}s both` }} />
          ))}
        </div>
        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className={skDarkCls} style={{ height: 100, borderRadius: 16, animation: `tl-shimmer 2s ease-in-out infinite, tl-fade-up 0.5s ease ${0.8 + i * 0.06}s both` }} />
          ))}
        </div>
        {/* Content cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div>
            <div className={skDarkCls} style={{ height: 160, borderRadius: 18, marginBottom: 16, animation: `tl-shimmer 2s ease-in-out infinite, tl-fade-up 0.5s ease 1.2s both` }} />
            <div className={skDarkCls} style={{ height: 120, borderRadius: 18, animation: `tl-shimmer 2s ease-in-out infinite, tl-fade-up 0.5s ease 1.3s both` }} />
          </div>
          <div>
            <div className={skDarkCls} style={{ height: 280, borderRadius: 18, animation: `tl-shimmer 2s ease-in-out infinite, tl-fade-up 0.5s ease 1.4s both` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TournamentListLoader({ game = "dota" }: { game?: string }) {
  const theme = GAME_THEMES[game] || GAME_THEMES.dota;
  const { color, colorRgb } = theme;
  const skCls = `tl-lsk-${game}`;

  return (
    <>
      <style>{`
        ${LOADER_KEYFRAMES}
        .${skCls} {
          background: linear-gradient(90deg, rgba(${colorRgb},0.03) 0%, rgba(${colorRgb},0.1) 40%, rgba(${colorRgb},0.03) 80%);
          background-size: 200% 100%;
          animation: tl-shimmer 1.8s ease-in-out infinite;
          border-radius: 16px;
        }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 30px 48px" }}>
        {/* Center loader */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <OrbitalRings color={color} colorRgb={colorRgb} size={56} />
        </div>

        {/* Stats pills */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[120, 100, 140].map((w, i) => (
            <div key={i} className={skCls} style={{ width: w, height: 38, borderRadius: 100, animation: `tl-shimmer 1.8s ease-in-out infinite, tl-fade-up 0.4s ease ${i * 0.08}s both` }} />
          ))}
        </div>

        {/* Card skeletons */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 18,
            background: "rgba(255,255,255,0.02)",
            border: `1px solid rgba(${colorRgb},0.06)`,
            borderRadius: 16, padding: 16, marginBottom: 10,
            animation: `tl-fade-up 0.5s ease ${0.2 + i * 0.1}s both`,
          }}>
            {/* Accent bar */}
            <div style={{ width: 4, height: 56, borderRadius: 4, background: `linear-gradient(180deg, ${color}, rgba(${colorRgb},0.2))`, animation: "tl-glow 2s ease-in-out infinite", animationDelay: `${i * 0.3}s` }} />
            {/* Icon */}
            <div className={skCls} style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0 }} />
            {/* Text lines */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={skCls} style={{ width: `${55 + i * 10}%`, height: 16, borderRadius: 6 }} />
              <div style={{ display: "flex", gap: 16 }}>
                <div className={skCls} style={{ width: 60, height: 10, borderRadius: 4 }} />
                <div className={skCls} style={{ width: 50, height: 10, borderRadius: 4 }} />
                <div className={skCls} style={{ width: 70, height: 10, borderRadius: 4 }} />
              </div>
            </div>
            {/* Button area */}
            <div className={skCls} style={{ width: 120, height: 38, borderRadius: 100, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </>
  );
}
