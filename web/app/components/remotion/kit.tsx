/**
 * The look both tournament-page films share: cream page, ink outlines, hard
 * offset shadows, sticker labels, highlighter marks — and one header slot
 * pinned to the top of the frame.
 *
 * It lives here rather than inside either film because the two play side by
 * side on desktop. Two copies of a palette drift the first time one is tweaked,
 * and then the pair looks like two different products.
 *
 * The game accent is only ever a FILL (buttons, highlights, badges) with ink on
 * top. As text on cream, Valorant cyan and CS2 amber fail contrast.
 */

import { AbsoluteFill, Easing, interpolate } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

export type Theme = (typeof GAME_THEME)[GameKey];

// ── palette ────────────────────────────────────────────────────────────────
export const INK = "#16131F";
export const PAPER = "#FFF7EA";
export const CARD = "#FFFFFF";
export const BODY = "#4E4858";
export const MUTED = "#8A8394";
export const LILAC = "#C9B6FF";
export const LEMON = "#FFE066";
export const PINK = "#FF9EC4";
export const MINT = "#A6F0C6";
export const GOLD = "#FFD24A";
export const OK_TEXT = "#0E7A43";
export const BAD_TEXT = "#C2412D";
export const FONT = "system-ui,-apple-system,'Segoe UI',sans-serif";

// ── layout ─────────────────────────────────────────────────────────────────
// 720×900. Header slot from HEADER_TOP, body from BODY_TOP, progress bar at the
// foot. Titles are sized to take two lines at most inside the slot — anything
// longer should carry an explicit <br /> rather than be left to wrap.
export const PAD_X = 56;
export const HEADER_TOP = 92;
export const BODY_TOP = 290;
export const HEADER_SIZE = 60;

// ── motion ─────────────────────────────────────────────────────────────────
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE = Easing.bezier(0.33, 1, 0.68, 1);
export const BOUNCE = Easing.out(Easing.back(2.2));

/** A body panel arriving from below and leaving upward, so two panels crossing
 *  stay spatially apart instead of printing one over the other. */
export const beat = (frame: number, a: number, b: number, r = 12) => {
  const enter = interpolate(frame, [a, a + r], [0, 1], { ...clamp, easing: EASE });
  const exit = interpolate(frame, [b - r, b], [0, 1], { ...clamp, easing: EASE });
  return { opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 30 - exit * 30}px)` };
};

/** Bouncy 0→1 scale for things that pop in. */
export const popIn = (frame: number, at: number, dur = 12, from = 0.6) =>
  interpolate(frame, [at, at + dur], [from, 1], { ...clamp, easing: BOUNCE });

// ── pieces ─────────────────────────────────────────────────────────────────

export const Sticker: React.FC<{ bg: string; rot?: number; size?: number; pop?: number; children: React.ReactNode }> = ({ bg, rot = -2, size = 15, pop = 1, children }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", padding: `${Math.round(size * 0.42)}px ${Math.round(size * 0.9)}px`,
    background: bg, color: INK, border: `2.5px solid ${INK}`, borderRadius: 100, boxShadow: `3px 3px 0 ${INK}`,
    fontSize: size, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap",
    transform: `rotate(${rot}deg) scale(${pop})`, transformOrigin: "left center",
  }}>{children}</div>
);

/** Highlighter stroke behind the lower half of the words. */
export const Mark: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <span style={{
    background: `linear-gradient(180deg, transparent 54%, ${c} 54%, ${c} 92%, transparent 92%)`,
    padding: "0 5px", margin: "0 -2px", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone",
  }}>{children}</span>
);

export const Sparkle: React.FC<{ x: number; y: number; s: number; rot: number; fill?: string }> = ({ x, y, s, rot, fill = INK }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)` }}>
    <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill={fill} stroke={INK} strokeWidth={fill === INK ? 0 : 1.5} />
  </svg>
);

/** Dot grid, pastel blobs and a few sparkles — all kept to the edges, clear of
 *  the header slot's text and the body. */
export const Backdrop: React.FC<{ frame: number; T: Theme }> = ({ frame, T }) => {
  const d = Math.sin(frame / 70);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        backgroundImage: `radial-gradient(${INK}24 1.6px, transparent 1.8px)`,
        backgroundSize: "26px 26px", backgroundPosition: `${frame * 0.12}px ${frame * 0.12}px`,
      }} />
      <div style={{ position: "absolute", width: 440, height: 440, borderRadius: "50%", background: LILAC, opacity: 0.5, right: -190 + d * 14, top: -210 }} />
      <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: LEMON, opacity: 0.55, left: -200, bottom: -170 - d * 12 }} />
      <div style={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", background: T.acc, opacity: 0.3, right: 24, bottom: 120 + d * 10 }} />
      <Sparkle x={674} y={262} s={20} rot={frame * 1.5} />
      <Sparkle x={18} y={796} s={22} rot={-frame * 1.2} />
      <Sparkle x={684} y={500} s={16} rot={frame} fill={PINK} />
    </AbsoluteFill>
  );
};

/** Wordmark left, a sticker right. The only thing above the header slot. */
export const TopBar: React.FC<{ frame: number; T: Theme; label: string }> = ({ frame, T, label }) => (
  <div style={{ position: "absolute", top: 30, left: PAD_X, right: PAD_X, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 6 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 15, height: 15, background: T.acc, border: `2.5px solid ${INK}`, borderRadius: 3, transform: `rotate(${45 + frame * 0.8}deg)` }} />
      <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: ".2em", color: INK }}>IESPORTS</span>
    </div>
    <Sticker bg={T.acc} rot={3} size={14}>{label}</Sticker>
  </div>
);

export const ProgressBar: React.FC<{ frame: number; dur: number; T: Theme }> = ({ frame, dur, T }) => (
  <div style={{
    position: "absolute", left: PAD_X, right: PAD_X, bottom: 40, height: 16, boxSizing: "border-box",
    border: `2.5px solid ${INK}`, borderRadius: 100, background: CARD, overflow: "hidden", zIndex: 6,
  }}>
    <div style={{ height: "100%", width: `${(frame / dur) * 100}%`, background: T.acc, borderRight: `2.5px solid ${INK}` }} />
  </div>
);

// ── the header slot ────────────────────────────────────────────────────────

export type HeaderSpec = { a: number; b: number; eyebrow: string; bg: string; title: React.ReactNode; size?: number };

/**
 * One beat's title. Headers hand over rather than cross-fade: the outgoing one
 * is gone by b-2, which is where the next beat's header starts (beats overlap
 * by 6 frames), so two titles never share the slot.
 */
export const Header: React.FC<{ frame: number; spec: HeaderSpec }> = ({ frame, spec }) => {
  const { a, b, eyebrow, bg, title, size = HEADER_SIZE } = spec;
  const enter = a < 0 ? 1 : interpolate(frame, [a + 4, a + 14], [0, 1], { ...clamp, easing: EASE });
  const exit = interpolate(frame, [b - 8, b - 2], [0, 1], { ...clamp, easing: EASE });
  const o = enter * (1 - exit);
  if (o <= 0.001) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o, transform: `translateY(${(1 - enter) * 20 - exit * 20}px)` }}>
      <Sticker bg={bg} rot={-2.5} size={17} pop={a < 0 ? 1 : popIn(frame, a + 4)}>{eyebrow}</Sticker>
      <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.0, letterSpacing: "-.035em", marginTop: 14, color: INK }}>{title}</div>
    </div>
  );
};

/** The slot itself; render every beat's spec into it. */
export const HeaderSlot: React.FC<{ frame: number; specs: HeaderSpec[] }> = ({ frame, specs }) => (
  <div style={{ position: "absolute", top: HEADER_TOP, left: PAD_X, right: PAD_X, height: BODY_TOP - HEADER_TOP - 8, zIndex: 5 }}>
    {specs.map((h, i) => <Header key={i} frame={frame} spec={h} />)}
  </div>
);
