"use client";

/**
 * Draft — the design system.
 *
 * Every colour, radius, glow and easing in the app is defined once here as a CSS
 * custom property and consumed everywhere else. The token block is scoped to
 * `.dl-app` rather than `:root` on purpose: this is one route inside a larger
 * site, and a global `:root` override would leak a game's palette into the
 * tournament pages.
 *
 * The JS constants in `ui.tsx` mirror these values, because a lot of the app
 * builds translucent variants by string concatenation (`${ACCENT}55`), which a
 * `var()` cannot do. The hex values in the two files must stay in step.
 */

export const FONT = "var(--font-geist-sans), Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export function DraftTheme() {
  return (
    <style>{`
      .dl-app {
        /* surfaces */
        --bg:        #0B0E14;
        --surface:   #12161F;
        --surface-2: #181D28;
        --overlay:   rgba(8, 11, 18, 0.92);

        /* accents */
        --primary:   #FF3B3B;
        --primary-h: #FF5555;
        --gold:      #F5A623;
        --gold-h:    #FFBE4D;
        --success:   #00E676;
        --danger:    #FF1744;
        --ally:      #00B0FF;
        --enemy:     #FF5252;

        /* text */
        --text:      #E8EAED;
        --muted:     #8B95A8;
        --dim:       #5C6577;

        /* lines */
        --line:      rgba(255,255,255,0.06);
        --line-hi:   rgba(255,255,255,0.12);

        /* glows */
        --glow-primary: 0 0 24px rgba(255, 59, 59, 0.45);
        --glow-gold:    0 0 24px rgba(245, 166, 35, 0.40);
        --glow-success: 0 0 20px rgba(0, 230, 118, 0.35);

        /* radii */
        --r-card: 16px;
        --r-btn:  12px;
        --r-chip: 8px;

        --ease: cubic-bezier(.22, .9, .3, 1);
        --t:    170ms;

        color-scheme: dark;
      }

      html, body { background: #0B0E14; overscroll-behavior: none; }

      /* ---------------------------------------------------------- surfaces */

      /*
       * The 1px top highlight that keeps a dark card from reading as a hole.
       * Done with a pseudo-element rather than a border so it does not fight the
       * card's own border colour on hover.
       */
      .dl-card { position: relative; }
      .dl-card::before {
        content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.08) 22%, rgba(255,255,255,.08) 78%, transparent);
        pointer-events: none; border-radius: inherit;
      }

      /* ------------------------------------------------------ interactions */

      .dl-btn {
        transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease),
                    filter var(--t) var(--ease), background var(--t) var(--ease),
                    border-color var(--t) var(--ease);
        -webkit-tap-highlight-color: transparent;
      }
      .dl-btn:active:not(:disabled) { transform: scale(.965); }
      @media (hover: hover) {
        .dl-btn:hover:not(:disabled) { transform: scale(1.02); filter: brightness(1.08); }
      }

      .dl-pick {
        transition: transform var(--t) var(--ease), border-color var(--t) var(--ease),
                    box-shadow var(--t) var(--ease);
        -webkit-tap-highlight-color: transparent;
      }
      .dl-pick:active { transform: scale(.92); }
      @media (hover: hover) {
        .dl-pick:hover {
          transform: scale(1.045);
          border-color: rgba(255,255,255,.28) !important;
          box-shadow: 0 8px 26px -10px rgba(0,0,0,.9), 0 0 18px -4px rgba(255,255,255,.18);
          z-index: 2;
        }
      }

      /* ---------------------------------------------------------- keyframes */

      @keyframes dl-idle   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes dl-pulse  { 0%,100% { opacity:.45 } 50% { opacity:1 } }
      @keyframes dl-in     { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
      @keyframes dl-sheen  { from { background-position: -220% 0 } to { background-position: 320% 0 } }

      /* A hero landing in a slot: drops in, overshoots, settles. */
      @keyframes dl-drop {
        0%   { opacity:0; transform: translateY(-22px) scale(.9) }
        55%  { opacity:1; transform: translateY(4px) scale(1.035) }
        75%  { transform: translateY(-2px) scale(.995) }
        100% { transform: none }
      }
      @keyframes dl-flash  { 0% { opacity:.9 } 100% { opacity:0 } }

      /* The ban stamp — slams down, rotates in, holds. */
      @keyframes dl-stamp {
        0%   { opacity:0; transform: scale(2.4) rotate(-18deg) }
        60%  { opacity:1; transform: scale(.92) rotate(-11deg) }
        100% { opacity:1; transform: scale(1) rotate(-11deg) }
      }

      @keyframes dl-urgent { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
      @keyframes dl-burst  { 0% { opacity:1; transform: translate(0,0) scale(1) } 100% { opacity:0; transform: translate(var(--dx), var(--dy)) scale(.35) } }
      @keyframes dl-float  { 0%,100% { transform: translateY(0) translateX(0); opacity:var(--o) } 50% { transform: translateY(-26px) translateX(8px); opacity:calc(var(--o) * 2) } }
      @keyframes dl-ring   { 0% { opacity:.65; transform: scale(.82) } 100% { opacity:0; transform: scale(1.5) } }

      .dl-in     { animation: dl-in .32s var(--ease) both; }
      .dl-turn   { animation: dl-pulse 1.3s ease-in-out infinite; }
      .dl-drop   { animation: dl-drop .5s var(--ease) both; }
      .dl-flash  { animation: dl-flash .6s ease-out both; }
      .dl-stamp  { animation: dl-stamp .42s var(--ease) both; }
      .dl-urgent { animation: dl-urgent .62s ease-in-out infinite; }

      .dl-sheen {
        background: linear-gradient(100deg, transparent 38%, rgba(255,255,255,.09) 50%, transparent 62%);
        background-size: 220% 100%;
        animation: dl-sheen 1.7s linear infinite;
      }

      ::-webkit-scrollbar { width: 0; height: 0; }

      /*
       * Low-end phones and anyone who asked for less motion get the layout with
       * none of the movement. The particle field is removed outright rather than
       * frozen — a static dot field is just noise.
       */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; transition-duration: 1ms !important; }
        .dl-particles { display: none !important; }
      }
    `}</style>
  );
}

/**
 * The drifting field behind the home screen.
 *
 * Deliberately CSS-only and fixed at fourteen nodes: a canvas particle system
 * would run a requestAnimationFrame loop on every phone that opens the menu, to
 * render something nobody is meant to consciously notice.
 */
const NODES = [
  [6, 18, 3, 15, 0], [18, 72, 2, 19, 3], [31, 34, 4, 17, 6], [44, 84, 2, 21, 1],
  [57, 22, 3, 16, 4], [69, 61, 2, 20, 8], [78, 12, 4, 18, 2], [88, 47, 3, 22, 5],
  [12, 52, 2, 23, 7], [37, 8, 2, 17, 9], [63, 91, 3, 19, 2], [93, 77, 2, 24, 6],
  [25, 96, 3, 20, 4], [50, 45, 2, 18, 11],
] as const;

export function ParticleField({ tint = "255,59,59" }: { tint?: string }) {
  return (
    <div className="dl-particles" aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
    }}>
      {NODES.map(([left, top, size, dur, delay], i) => (
        <span key={i} style={{
          position: "absolute", left: `${left}%`, top: `${top}%`,
          width: size, height: size, borderRadius: "50%",
          background: `rgba(${tint}, .9)`,
          boxShadow: `0 0 ${size * 4}px rgba(${tint}, .7)`,
          ["--o" as string]: "0.10",
          animation: `dl-float ${dur}s ease-in-out ${delay}s infinite`,
          opacity: 0.1,
        }} />
      ))}
    </div>
  );
}

/**
 * A one-shot particle burst. Twenty spans thrown outward on a fixed set of
 * angles — enough to register as a celebration, cheap enough to fire on a phone
 * mid-animation without dropping the frame the score is counting on.
 */
export function Burst({ color, n = 20, spread = 90, size = 6 }: { color: string; n?: number; spread?: number; size?: number }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center", zIndex: 5 }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = spread * (0.55 + ((i * 37) % 45) / 100);
        return (
          <span key={i} style={{
            position: "absolute", width: size, height: size, borderRadius: 2, background: color,
            boxShadow: `0 0 10px ${color}`,
            ["--dx" as string]: `${Math.cos(a) * d}px`,
            ["--dy" as string]: `${Math.sin(a) * d}px`,
            animation: `dl-burst ${520 + (i % 5) * 90}ms var(--ease) both`,
          }} />
        );
      })}
    </div>
  );
}

/** Elegant skeleton block, matching the card surface rather than a grey bar. */
export function Skeleton({ h = 120, r = "var(--r-card)", style }: { h?: number | string; r?: string; style?: React.CSSProperties }) {
  return (
    <div className="dl-sheen" style={{
      height: h, borderRadius: r, background: "var(--surface)",
      border: "1px solid var(--line)", ...style,
    }} />
  );
}
