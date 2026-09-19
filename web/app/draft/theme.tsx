"use client";

/**
 * Draft — the design system.
 *
 * This is the sticker style the rest of iesports now wears: the landing page
 * (app/HomeClient.tsx) and the two Horizon films (app/components/remotion/kit.tsx)
 * share a cream page, ink outlines, hard offset shadows, pill stickers,
 * highlighter marks and drifting pastel blobs. Draft Lab used to be the one
 * route still painted in Dota's slate-and-gold, which made it read as a
 * different product bolted onto the site.
 *
 * Dota is still in here, but as CONTENT rather than chrome: Radiant green and
 * Dire red are the two sides, the ornament gold is the score colour, the
 * attribute colours are the ones the client uses, and the hero art keeps its own
 * dark bed because a cream bed shows as a halo around every portrait. What
 * changed is everything around the art — cut corners became rounded, glows
 * became hard ink shadows, and the near-black surfaces became paper.
 *
 * THREE TEXT TOKENS, NOT ONE. The films can get away with `color: INK`
 * everywhere because they only ever run on cream. This route has a night mode,
 * and there the outline colour has to invert while text on a pastel fill must
 * NOT — a lemon sticker still needs near-black on it at 2am. So:
 *
 *   --stroke   outlines and the hard offset shadows
 *   --text     body copy on the page surface
 *   --on-fill  text sitting on a pastel fill — near-black in both modes
 *
 * PAIRS, NOT SINGLE ACCENTS. Every accent exists twice: a readable version for
 * text and borders, and a pastel `-fill` for the sticker it sits inside. Mint on
 * cream is roughly 1.4:1, so the fill can never be the text colour, and the
 * readable green can never be the sticker.
 *
 * Every value lives here once as a CSS custom property, scoped to `.dl-app`
 * rather than `:root` — this is one route inside a larger site, and a global
 * override would leak the game's palette into the tournament pages. The JS
 * constants in `ui.tsx` mirror these names, because a lot of the app builds
 * translucent variants with `color-mix()` at the call site.
 */

export const FONT = "var(--font-geist-sans), Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export function DraftTheme() {
  return (
    <style>{`
      .dl-app {
        /* ── surfaces: paper, not slate ─────────────────────────────────── */
        --paper:     #FFF7EA;
        --card:      #FFFFFF;
        --card-2:    #FFF1DC;
        --field:     #FFFFFF;
        --disabled:  #EFE7D8;
        --chrome:    rgba(255, 247, 234, 0.94);
        --overlay:   rgba(255, 247, 234, 0.95);

        /*
         * The hero bed stays dark in BOTH modes. Valve's portraits are dark art
         * with dark edges; on cream every one of them gets a visible halo.
         */
        --tile:      #14121C;

        /* ── the three text tokens ──────────────────────────────────────── */
        --stroke:    #16131F;
        --text:      #16131F;
        --body:      #4E4858;
        --muted:     #8A8394;
        --on-fill:   #16131F;

        /* ── the pastels, straight from the films' kit ──────────────────── */
        --lilac:     #C9B6FF;
        --lemon:     #FFE066;
        --pink:      #FF9EC4;
        --mint:      #A6F0C6;
        --gold-fill: #FFD24A;
        --sky:       #A9DCFF;
        --coral:     #FFB3A0;

        /* ── the two sides ──────────────────────────────────────────────── */
        --radiant:      #0E7A43;
        --radiant-fill: #A6F0C6;
        --dire:         #C2412D;
        --dire-fill:    #FF9EC4;

        /* Dota's ornament gold, in a shade that survives being read. */
        --gold:      #8A6320;

        --ok:        #0E7A43;
        --danger:    #C2412D;

        /* ── attributes, as the client colours them ─────────────────────── */
        --str:       #B93529;  --str-fill: #FFB3A0;
        --agi:       #3E7D18;  --agi-fill: #BCEFA0;
        --int:       #1E6FA8;  --int-fill: #A9DCFF;
        --uni:       #7A3FA0;  --uni-fill: #D9C2FF;

        /* ── geometry ───────────────────────────────────────────────────── */
        --bw:        2.5px;
        --bw-2:      3px;
        --bw-3:      3.5px;
        --r-card:    18px;
        --r-btn:     999px;
        --r-chip:    12px;

        --ease:      cubic-bezier(.33, 1, .68, 1);
        --t:         140ms;

        color-scheme: light;
      }

      /*
       * Night. Not a different design — the same stickers on a dark sheet. The
       * outline colour inverts to cream, the pastels stay exactly as they are
       * (they are fills, and --on-fill keeps near-black text on them), and the
       * readable accents lift because #0E7A43 on #151220 is unreadable.
       */
      html[data-draft-theme="night"] .dl-app {
        --paper:     #151220;
        --card:      #211C2E;
        --card-2:    #2B2539;
        --field:     #2B2539;
        --disabled:  #2A2536;
        --chrome:    rgba(21, 18, 32, 0.94);
        --overlay:   rgba(21, 18, 32, 0.95);

        --stroke:    #F2E8D6;
        --text:      #F6F1E6;
        --body:      #C3BCCE;
        --muted:     #8E8799;

        --radiant:      #7FD9A6;
        --dire:         #FF8A73;
        --gold:         #FFD24A;
        --ok:           #7FD9A6;
        --danger:       #FF8A73;

        --str:       #FF8A73;
        --agi:       #A6E06A;
        --int:       #6FC0FF;
        --uni:       #C9A6FF;

        color-scheme: dark;
      }

      html, body { overscroll-behavior: none; }

      /* ------------------------------------------------------- vocabulary */

      /*
       * The sticker. A pill with a 2.5px ink outline, a hard offset shadow and a
       * couple of degrees of rotation — the single piece of the film kit that
       * places a screen in this world faster than any colour choice does.
       */
      .dl-stk {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 11px; border: var(--bw) solid var(--stroke); border-radius: var(--r-btn);
        box-shadow: 3px 3px 0 var(--stroke); color: var(--on-fill);
        font-size: .68rem; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;
        white-space: nowrap; transform: rotate(-2deg);
      }
      .dl-stk.r { transform: rotate(2.5deg); }
      .dl-stk.flat { transform: none; }

      /* Highlighter stroke behind the lower half of the words. */
      .dl-mark {
        --mark: var(--hl);
        background: linear-gradient(180deg, transparent 54%, var(--mark) 54%, var(--mark) 92%, transparent 92%);
        padding: 0 5px; margin: 0 -3px;
        -webkit-box-decoration-break: clone; box-decoration-break: clone;
      }
      /*
       * On the night sheet the words above the stroke are cream, not ink, so a
       * full-strength pastel puts cream on lemon for the bottom half of every
       * glyph. Thinning the stroke keeps the hue — which is what carries the
       * state in a header — while leaving the text on something dark.
       */
      html[data-draft-theme="night"] .dl-mark {
        --mark: color-mix(in srgb, var(--hl) 40%, transparent);
      }

      /* The card. Ink outline plus a hard shadow — never a border and a glow. */
      .dl-card {
        background: var(--card); border: var(--bw-2) solid var(--stroke);
        border-radius: var(--r-card); box-shadow: 5px 5px 0 var(--stroke);
      }

      /* An ornamental divider: a dashed ink rule rather than a fading gradient. */
      .dl-rule { height: 0; border-top: 2px dashed var(--stroke); opacity: .28; }

      /*
       * The chamfers this design replaced. Kept as no-ops so a .dl-cut left on
       * an element somewhere cannot clip a hard shadow off at the corner.
       */
      .dl-cut, .dl-cut-s { clip-path: none; }

      /* ------------------------------------------------------ interactions */

      /*
       * Press and lift, never scale.
       *
       * The depth is a per-element --sh, so a button can be shallow (3px) or a
       * headline card can be deep (9px) with one inline variable. NOTHING with
       * .dl-btn or .dl-pick on it may set box-shadow inline — an inline
       * value beats the class and the element stops moving on press.
       */
      .dl-btn, .dl-pick {
        box-shadow: var(--sh, 3px 3px 0 var(--stroke));
        transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease),
                    background var(--t) var(--ease), border-color var(--t) var(--ease),
                    color var(--t) var(--ease);
        -webkit-tap-highlight-color: transparent;
      }
      .dl-btn:active:not(:disabled), .dl-pick:active:not(:disabled) {
        transform: translate(2px, 2px); box-shadow: var(--sh-a, 1px 1px 0 var(--stroke));
      }
      @media (hover: hover) {
        .dl-btn:hover:not(:disabled), .dl-pick:hover:not(:disabled) {
          transform: translate(-2px, -2px); box-shadow: var(--sh-h, 5px 5px 0 var(--stroke)); z-index: 3;
        }
      }
      .dl-btn:disabled { box-shadow: 2px 2px 0 var(--stroke); opacity: .55; }

      /* Flat things — tab bar entries, chips inside a scroller — lift without
         carrying a shadow of their own. */
      .dl-flat { --sh: none; --sh-h: none; --sh-a: none; }

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
      @keyframes dl-ring   { 0% { opacity:.8; transform: scale(.84) } 100% { opacity:0; transform: scale(1.4) } }
      @keyframes dl-urgent { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
      @keyframes dl-burst  { 0% { opacity:1; transform: translate(0,0) scale(1) } 100% { opacity:0; transform: translate(var(--dx), var(--dy)) scale(.35) } }
      /* The quiz countdown. This was referenced before it existed, so "3 · 2 · 1"
         appeared with no animation at all. */
      @keyframes dl-slam {
        0%   { opacity:0; transform: scale(2.1) rotate(-8deg) }
        60%  { opacity:1; transform: scale(.92) rotate(2deg) }
        100% { opacity:1; transform: scale(1) rotate(0deg) }
      }

      /* The backdrop's drifting blobs and spinning sparkles. */
      @keyframes dl-drift { from { transform: translate(0, 0) } to { transform: translate(18px, -16px) } }
      @keyframes dl-spin  { to { transform: rotate(360deg) } }

      /* A tile taking the tap: squashes under the finger, then settles. This is
         the whole point of the live pool's optimistic lock — the server has not
         answered yet, so the press itself has to be the acknowledgement. */
      @keyframes dl-lock {
        0%   { transform: scale(1) }
        35%  { transform: scale(.88) }
        70%  { transform: scale(1.04) }
        100% { transform: scale(1) }
      }
      /* Coins landing in the header: rises out of the chip and fades. */
      @keyframes dl-coin {
        0%   { opacity:0; transform: translateY(5px) scale(.7) }
        22%  { opacity:1; transform: translateY(-3px) scale(1.12) }
        70%  { opacity:1; transform: translateY(-13px) scale(1) }
        100% { opacity:0; transform: translateY(-22px) scale(.95) }
      }
      /* Sonar: rings leaving the centre while the queue looks for someone. */
      @keyframes dl-sonar {
        0%   { opacity:.6;  transform: scale(.28) }
        70%  { opacity:.14; transform: scale(1) }
        100% { opacity:0;   transform: scale(1.15) }
      }

      .dl-in     { animation: dl-in .32s var(--ease) both; }
      .dl-turn   { animation: dl-pulse 1.3s ease-in-out infinite; }
      .dl-drop   { animation: dl-drop .5s var(--ease) both; }
      .dl-flash  { animation: dl-flash .6s ease-out both; }
      .dl-urgent { animation: dl-urgent .55s ease-in-out infinite; }
      .dl-lock   { animation: dl-lock .32s var(--ease) both; }
      .dl-coin   { animation: dl-coin 1.5s var(--ease) both; }

      .dl-sheen {
        background: linear-gradient(100deg, transparent 38%, color-mix(in srgb, var(--stroke) 9%, transparent) 50%, transparent 62%);
        background-size: 220% 100%;
        animation: dl-sheen 1.7s linear infinite;
      }

      .dl-app ::-webkit-scrollbar { width: 0; height: 0; }

      /*
       * Low-end phones and anyone who asked for less motion get the layout with
       * none of the movement. The backdrop is removed outright rather than
       * frozen — a static wash is just a muddier background.
       */
      @media (prefers-reduced-motion: reduce) {
        .dl-app *, .dl-app *::before, .dl-app *::after { animation: none !important; transition-duration: 1ms !important; }
        .dl-atmos { display: none !important; }
      }
    `}</style>
  );
}

/**
 * The backdrop.
 *
 * The landing page's exactly: a dot grid, three pastel blobs drifting on slow
 * offset cycles, and a few sparkles turning at the edges. It is doing the job
 * the old drifting Radiant/Dire lights did — give the page depth without
 * competing with what is on it — for the same three composited layers and no
 * per-frame script.
 *
 * `weight` lets a screen dial it down. The draft board wants a hint of paper
 * texture, not a pastel cloud behind 120 hero portraits.
 */
export function Backdrop({ weight = 1 }: { weight?: number }) {
  return (
    <div className="dl-atmos" aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(color-mix(in srgb, var(--stroke) 14%, transparent) 1.6px, transparent 1.8px)",
        backgroundSize: "26px 26px",
        opacity: 0.55 + 0.45 * weight,
      }} />
      <div style={{
        position: "absolute", width: 420, height: 420, borderRadius: "50%", background: "var(--lilac)",
        opacity: 0.46 * weight, right: -190, top: -200,
        animation: "dl-drift 15s ease-in-out infinite alternate",
      }} />
      <div style={{
        position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "var(--lemon)",
        opacity: 0.5 * weight, left: -180, bottom: -160,
        animation: "dl-drift 19s ease-in-out infinite alternate-reverse",
      }} />
      <div style={{
        position: "absolute", width: 140, height: 140, borderRadius: "50%", background: "var(--mint)",
        opacity: 0.4 * weight, right: "4%", bottom: "16%",
        animation: "dl-drift 13s ease-in-out infinite alternate",
      }} />
      <Sparkle style={{ right: "6%", top: "15%", animationDuration: "14s" }} size={20} />
      <Sparkle style={{ left: "4%", bottom: "13%", animationDirection: "reverse", animationDuration: "17s" }} size={22} />
      <Sparkle style={{ right: "13%", bottom: "7%", animationDuration: "21s" }} size={15} fill="var(--pink)" />
    </div>
  );
}

/** The four-point star the films and the landing page scatter at the edges. */
export function Sparkle({
  size = 18, fill, style,
}: { size?: number; fill?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
      style={{ position: "absolute", zIndex: 1, pointerEvents: "none", animation: "dl-spin 16s linear infinite", ...style }}>
      <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z"
        fill={fill ?? "var(--stroke)"} stroke="var(--stroke)" strokeWidth={fill ? 1.5 : 0} />
    </svg>
  );
}

/**
 * A one-shot particle burst — pastel confetti squares thrown outward on fixed
 * angles, each with its own ink outline so it reads as cut paper rather than as
 * the glowing sparks this used to throw.
 */
export function Burst({ color, n = 20, spread = 90, size = 7 }: { color: string; n?: number; spread?: number; size?: number }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", placeItems: "center", zIndex: 5 }}>
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = spread * (0.55 + ((i * 37) % 45) / 100);
        return (
          <span key={i} style={{
            position: "absolute", width: size, height: size, background: color,
            border: "1.5px solid var(--stroke)", borderRadius: i % 3 === 0 ? "50%" : 2,
            ["--dx" as string]: `${Math.cos(a) * d}px`,
            ["--dy" as string]: `${Math.sin(a) * d}px`,
            animation: `dl-burst ${520 + (i % 5) * 90}ms var(--ease) both`,
          }} />
        );
      })}
    </div>
  );
}

/** Skeleton block matching the card surface rather than a grey bar. */
export function Skeleton({ h = 120, style }: { h?: number | string; style?: React.CSSProperties }) {
  return (
    <div className="dl-sheen dl-card" style={{ height: h, ...style }} />
  );
}
