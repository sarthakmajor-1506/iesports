"use client";

/**
 * Draft — the design system.
 *
 * Dota's own client is the reference: desaturated slate rather than black, warm
 * gold ornament, Radiant green against Dire red, and corners that are chamfered
 * rather than rounded. Every value lives here once as a CSS custom property,
 * scoped to `.dl-app` rather than `:root` — this is one route inside a larger
 * site, and a global override would leak a game's palette into the tournament
 * pages.
 *
 * The JS constants in `ui.tsx` mirror these values, because a lot of the app
 * builds translucent variants by string concatenation (`${alpha(DIRE, 33)}`), which a
 * `var()` cannot do. The hex values in the two files must stay in step.
 */

export const FONT = "var(--font-geist-sans), Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export function DraftTheme() {
  return (
    <style>{`
      .dl-app {
        /* surfaces — Dota's slate, never pure black */
        --bg:        #101318;
        --surface:   #191E25;
        --surface-2: #222831;
        --overlay:   rgba(10, 13, 17, 0.93);
        --chrome:    rgba(10, 13, 17, 0.92);
        --tile:      #0A0D14;
        --field:     rgba(0,0,0,0.32);
        --disabled:  #1B2130;
        --hairline:  rgba(200,166,93,.34);

        /* the two sides */
        --radiant:   #A2B93B;
        --radiant-h: #BCD452;
        --dire:      #C8402C;
        --dire-h:    #E05138;

        /* Dota's ornament gold */
        --gold:      #C8A65D;
        --gold-h:    #E3BF74;

        /* attributes, as the client colours them */
        --str:       #E04A3F;
        --agi:       #9BC44E;
        --int:       #4BA9E8;
        --uni:       #C77DDA;

        --success:   #7FD44C;
        --danger:    #D6412B;

        /* text */
        --text:      #DDE1E4;
        --muted:     #8C949E;
        --dim:       #5D656F;

        /* lines */
        --line:      rgba(200,166,93,0.14);
        --line-hi:   rgba(200,166,93,0.30);

        /* glows */
        --glow-radiant: 0 0 24px rgba(162, 185, 59, 0.40);
        --glow-dire:    0 0 24px rgba(200, 64, 44, 0.42);
        --glow-gold:    0 0 22px rgba(200, 166, 93, 0.38);

        --r-card: 4px;
        --r-btn:  3px;
        --r-chip: 3px;

        --ease: cubic-bezier(.22, .9, .3, 1);
        --t:    170ms;

        color-scheme: dark;
      }

      /*
       * Light mode — warm stone and parchment rather than white, so it still
       * reads as Dota rather than as a document. The accents darken, because
       * #A2B93B on parchment is roughly 2:1 against the text it sits beside;
       * keeping the dark values here would have shipped a theme nobody could
       * read. The surfaces beneath hero art stay dark in both, since the art
       * itself is dark and a light bed shows as a halo around every portrait.
       */
      html[data-draft-theme="light"] .dl-app {
        --bg:        #E7E3D9;
        --surface:   #F4F1EA;
        --surface-2: #DED8CA;
        --overlay:   rgba(244, 241, 234, 0.93);

        --radiant:   #5E7317;
        --radiant-h: #71891F;
        --dire:      #B33320;
        --dire-h:    #CA3D27;

        --gold:      #8A6A20;
        --gold-h:    #A5812C;

        --str:       #B93529;
        --agi:       #5E7317;
        --int:       #1E6FA8;
        --uni:       #8A44A0;

        --success:   #3E7D18;
        --danger:    #B62A17;

        --text:      #1A1D22;
        --muted:     #565D66;
        --dim:       #7C848E;

        --line:      rgba(70, 55, 22, 0.18);
        --line-hi:   rgba(70, 55, 22, 0.34);

        --chrome:    rgba(244, 241, 234, 0.92);
        --tile:      #CFC9BB;

        --glow-radiant: 0 0 18px rgba(94, 115, 23, 0.28);
        --glow-dire:    0 0 18px rgba(179, 51, 32, 0.30);
        --glow-gold:    0 0 16px rgba(138, 106, 32, 0.28);
      }

      html, body { overscroll-behavior: none; }

      /* ---------------------------------------------------------- surfaces */

      /*
       * Chamfered corners. Dota's panels are cut, not rounded, and this single
       * detail does more to place the interface in that world than any colour
       * choice — a 16px radius reads as a web app no matter what is painted on it.
       */
      .dl-cut  { clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px); }
      .dl-cut-s { clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); }

      /* The hairline of gold along the top edge that keeps a dark panel from reading as a hole. */
      .dl-card { position: relative; }
      .dl-card::before {
        content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
        background: linear-gradient(90deg, transparent, var(--hairline) 22%, var(--hairline) 78%, transparent);
        pointer-events: none;
      }

      /* An ornamental divider — a gold rule that fades out from a centre diamond. */
      .dl-rule {
        height: 1px; background: linear-gradient(90deg, transparent, rgba(200,166,93,.32), transparent);
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
        .dl-btn:hover:not(:disabled) { transform: scale(1.02); filter: brightness(1.1); }
      }

      .dl-pick {
        transition: transform var(--t) var(--ease), border-color var(--t) var(--ease),
                    box-shadow var(--t) var(--ease), filter var(--t) var(--ease);
        -webkit-tap-highlight-color: transparent;
      }
      .dl-pick:active { transform: scale(.9); }
      @media (hover: hover) {
        .dl-pick:hover {
          transform: scale(1.06);
          filter: brightness(1.15);
          box-shadow: 0 6px 22px -8px #000, 0 0 16px -3px rgba(200,166,93,.65);
          z-index: 3;
        }
      }

      /* ---------------------------------------------------------- keyframes */

      @keyframes dl-idle   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes dl-pulse  { 0%,100% { opacity:.45 } 50% { opacity:1 } }
      @keyframes dl-in     { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
      @keyframes dl-sheen  { from { background-position: -220% 0 } to { background-position: 320% 0 } }

      /* A hero landing in a slot: drops in, overshoots, settles. */
      @keyframes dl-drop {
        0%   { opacity:0; transform: translateY(-20px) scale(.9) }
        55%  { opacity:1; transform: translateY(4px) scale(1.03) }
        75%  { transform: translateY(-2px) scale(.995) }
        100% { transform: none }
      }
      @keyframes dl-flash  { 0% { opacity:.9 } 100% { opacity:0 } }
      @keyframes dl-ring   { 0% { opacity:.7; transform: scale(.84) } 100% { opacity:0; transform: scale(1.45) } }
      @keyframes dl-urgent { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
      @keyframes dl-burst  { 0% { opacity:1; transform: translate(0,0) scale(1) } 100% { opacity:0; transform: translate(var(--dx), var(--dy)) scale(.35) } }

      /*
       * The ambient drift. Two enormous soft lights, Radiant from one corner and
       * Dire from the other, breathing past each other on a slow cycle. Cheap
       * because it is two elements moving on the compositor, not a particle loop.
       */
      @keyframes dl-drift-a {
        0%,100% { transform: translate3d(-8%, -6%, 0) scale(1) }
        50%     { transform: translate3d(6%, 8%, 0) scale(1.14) }
      }
      @keyframes dl-drift-b {
        0%,100% { transform: translate3d(7%, 9%, 0) scale(1.1) }
        50%     { transform: translate3d(-6%, -7%, 0) scale(1) }
      }
      /* A faint diagonal weave panning behind everything, like the client's stonework. */
      @keyframes dl-weave { from { background-position: 0 0 } to { background-position: 120px 120px } }
      html[data-draft-theme="light"] .dl-atmos { opacity: .55; }

      .dl-in     { animation: dl-in .32s var(--ease) both; }
      .dl-turn   { animation: dl-pulse 1.3s ease-in-out infinite; }
      .dl-drop   { animation: dl-drop .5s var(--ease) both; }
      .dl-flash  { animation: dl-flash .6s ease-out both; }
      .dl-urgent { animation: dl-urgent .55s ease-in-out infinite; }

      .dl-sheen {
        background: linear-gradient(100deg, transparent 38%, rgba(200,166,93,.10) 50%, transparent 62%);
        background-size: 220% 100%;
        animation: dl-sheen 1.7s linear infinite;
      }

      ::-webkit-scrollbar { width: 0; height: 0; }

      /*
       * Low-end phones and anyone who asked for less motion get the layout with
       * none of the movement. The atmosphere is removed outright rather than
       * frozen — a static wash is just a muddier background.
       */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; transition-duration: 1ms !important; }
        .dl-atmos { display: none !important; }
      }
    `}</style>
  );
}

/**
 * The background.
 *
 * Radiant light bleeding in from one corner and Dire from the other, drifting
 * slowly past each other, over a faint diagonal weave. It is doing the job a
 * looping video of the Dota map would do, for none of the bytes and none of the
 * battery: three composited layers, no script, no per-frame work.
 *
 * `weight` lets a screen dial it down — the draft board wants atmosphere, not
 * competition with the heroes on it.
 */
export function DotaAtmosphere({ weight = 1 }: { weight?: number }) {
  return (
    <div className="dl-atmos" aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
    }}>
      <div style={{
        position: "absolute", inset: "-30%",
        background: `radial-gradient(closest-side, rgba(162,185,59,${0.16 * weight}), transparent 72%)`,
        animation: "dl-drift-a 34s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", inset: "-30%",
        background: `radial-gradient(closest-side, rgba(200,64,44,${0.17 * weight}), transparent 72%)`,
        animation: "dl-drift-b 41s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", inset: 0, opacity: 0.5 * weight,
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(200,166,93,.030) 0 1px, transparent 1px 14px)," +
          "repeating-linear-gradient(-45deg, rgba(255,255,255,.016) 0 1px, transparent 1px 22px)",
        animation: "dl-weave 90s linear infinite",
      }} />
    </div>
  );
}

/**
 * A one-shot particle burst — twenty spans thrown outward on fixed angles.
 * Enough to register as a celebration, cheap enough to fire mid-animation on a
 * phone without dropping the frame the score is counting on.
 */
export function Burst({ color, n = 20, spread = 90, size = 6 }: { color: string; n?: number; spread?: number; size?: number }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center", zIndex: 5 }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = spread * (0.55 + ((i * 37) % 45) / 100);
        return (
          <span key={i} style={{
            position: "absolute", width: size, height: size, background: color,
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

/** Skeleton block matching the panel surface rather than a grey bar. */
export function Skeleton({ h = 120, style }: { h?: number | string; style?: React.CSSProperties }) {
  return (
    <div className="dl-sheen dl-cut" style={{
      height: h, background: "var(--surface)", border: "1px solid var(--line)", ...style,
    }} />
  );
}
