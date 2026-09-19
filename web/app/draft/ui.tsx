"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DraftTheme, Backdrop, FONT } from "./theme";
import { useMuted, useNight } from "./sound";

/* ------------------------------------------------------------------ tokens
 *
 * Every colour is a CSS variable defined in `theme.tsx`, so swapping paper for
 * night is one attribute on <html> — no context, no re-render, no prop drilling.
 * Sizes stay plain numbers, because they do not change between the two.
 *
 * READABLE vs FILL. Each accent comes in two halves and they are not
 * interchangeable. `ALLY` is a green you can set as `color`; `ALLY_FILL` is the
 * mint you put behind ink. Using the fill as text is how you get a label nobody
 * can read, and using the readable one as a sticker background is how you get a
 * page that stops looking like the rest of the site.
 */

export const BG = "var(--paper)";
export const PAPER = "var(--paper)";
export const PANEL = "var(--card)";        // elevated surface
export const PANEL_2 = "var(--card-2)";    // secondary surface
export const LINE = "var(--stroke)";       // the ink outline — 2.5-3.5px, never a hairline
export const LINE_HI = "var(--stroke)";
export const STROKE = "var(--stroke)";
export const CREAM = "var(--text)";        // primary text
export const MUTED = "var(--body)";
export const DIM = "var(--muted)";
/** Text that sits ON a pastel fill. Near-black in both sheets, never `--text`. */
export const ON_FILL = "var(--on-fill)";

/** The pastel fills, straight from the films' kit. */
export const LILAC = "var(--lilac)";
export const LEMON = "var(--lemon)";
export const PINK = "var(--pink)";
export const MINT = "var(--mint)";
export const SKY = "var(--sky)";
export const CORAL = "var(--coral)";
export const GOLD_FILL = "var(--gold-fill)";

/** The two sides, as Dota colours them — readable half and sticker half. */
export const RADIANT = "var(--radiant)";
export const RADIANT_FILL = "var(--radiant-fill)";
export const DIRE = "var(--dire)";
export const DIRE_FILL = "var(--dire-fill)";

/** Dota's ornament gold, in the shade that survives being read on cream. */
export const GOLD = "var(--gold)";

export const GREEN = "var(--ok)";          // success, correct, positive delta
export const GREEN_FILL = MINT;
export const DANGER = "var(--danger)";     // ban, wrong
export const DANGER_FILL = PINK;
export const ALLY = RADIANT;               // your side is always Radiant
export const ALLY_FILL = RADIANT_FILL;
export const ENEMY = DIRE;                 // theirs is always Dire
export const ENEMY_FILL = DIRE_FILL;
export const RED = DIRE;
export const BLUE = "var(--int)";

/** Rounded, not chamfered — the whole page is cut paper now. */
export const R_CARD = 18, R_BTN = 999, R_CHIP = 12;

/** Ink outline weights. */
export const BW = 2.5, BW_2 = 3, BW_3 = 3.5;

/** Attribute colours, as the client paints them, in both halves. */
export const ATTR = { str: "var(--str)", agi: "var(--agi)", int: "var(--int)", all: "var(--uni)" } as const;
export const ATTR_FILL = { str: "var(--str-fill)", agi: "var(--agi-fill)", int: "var(--int-fill)", all: "var(--uni-fill)" } as const;

/**
 * A translucent variant of any colour, including a CSS variable.
 *
 * The app used to build these by appending two hex digits to a constant, which
 * only works while the constant is a hex literal — and that is precisely what
 * made a second sheet impossible, since `var(--gold)44` is not a colour at all.
 * `color-mix()` takes a variable happily, so the palette can now be swapped by an
 * attribute without touching a single call site.
 */
export const alpha = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** A pastel fill, softened toward paper — for a tint that is not a full sticker. */
export const wash = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--card))`;

export const attrColor = (a: string) => ATTR[a as keyof typeof ATTR] ?? ATTR.all;
export const attrFill = (a: string) => ATTR_FILL[a as keyof typeof ATTR_FILL] ?? ATTR_FILL.all;
export const attrName = (a: string) => (a === "str" ? "STRENGTH" : a === "agi" ? "AGILITY" : a === "int" ? "INTELLIGENCE" : "UNIVERSAL");

/** Hard offset shadow, as a `--sh` triple for anything wearing `.dl-btn`/`.dl-pick`. */
export const lift = (d = 3) => ({
  ["--sh" as string]: `${d}px ${d}px 0 var(--stroke)`,
  ["--sh-h" as string]: `${d + 2}px ${d + 2}px 0 var(--stroke)`,
  ["--sh-a" as string]: `1px 1px 0 var(--stroke)`,
}) as React.CSSProperties;

/**
 * Sign in with Discord.
 *
 * The buttons in here used to link to `/login`, which is an eight-line stub that
 * prints "Sign in to join tournaments" and has no button on it — a dead end, and
 * the reason signing in from the game did nothing. This is the same flow the
 * navbar and the landing page use: stash where we are, hand off to Discord, and
 * `/auth/discord-success` brings the player back to exactly this screen.
 */
export function signInWithDiscord() {
  try {
    sessionStorage.setItem("redirectAfterLogin", window.location.pathname + window.location.search);
  } catch { /* private mode: they land on the front page instead, still signed in */ }
  window.location.href = "/api/auth/discord-login";
}

/** Discord's mark, for the button that carries it. */
export function DiscordIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block", flexShrink: 0 }}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function anonId() {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("draftlab_anon");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("draftlab_anon", id);
    }
    return id;
  } catch {
    return "nostore";
  }
}

/* ----------------------------------------------------------- the vocabulary */

/**
 * The sticker — a rotated pill with an ink outline and a hard shadow.
 *
 * This is the unit the whole site labels things with: the films' eyebrows, the
 * landing page's game chips, and now every kicker in the game. `bg` is always a
 * FILL and the text on it is always `--on-fill`.
 */
export function Sticker({
  children, bg = LEMON, rot = -2, size = 11, style,
}: { children: React.ReactNode; bg?: string; rot?: number; size?: number; style?: React.CSSProperties }) {
  return (
    <span className="dl-stk" style={{
      background: bg, fontSize: size, transform: `rotate(${rot}deg)`,
      padding: `${Math.round(size * 0.38)}px ${Math.round(size * 0.85)}px`, ...style,
    }}>{children}</span>
  );
}

/** Highlighter stroke behind the lower half of the words. */
export function Mark({ c = LEMON, children }: { c?: string; children: React.ReactNode }) {
  return <span className="dl-mark" style={{ ["--hl" as string]: c }}>{children}</span>;
}

/* ------------------------------------------------------------------- frame */

/**
 * The app frame.
 *
 * The stage is exactly one viewport tall and does not scroll — only `children`
 * does, between a pinned `head` and a pinned `foot`. Every control that gets used
 * repeatedly therefore stays under the thumb no matter how long the list below
 * it grows.
 *
 * On a desktop the column gets an ink outline and a hard shadow, so it reads as
 * a sheet of paper laid on the backdrop rather than as a phone-shaped hole. On a
 * phone the outline is dropped: a 3px border down both edges of a 390px screen
 * is 6px of nothing.
 *
 * It also carries `.dl-app`, which is where the whole token system is scoped, and
 * renders the theme itself so no page has to remember to.
 */
export function Shell({
  head, children, foot, tab, pad = true, glow, atmos = 1,
}: {
  head?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  tab?: Tab | null;
  pad?: boolean;
  /** A pastel wash behind the stage, e.g. the winner's colour on a result. */
  glow?: string;
  /** Dial the backdrop down on busy screens. */
  atmos?: number;
}) {
  useNight();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 620px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  return (
    <div className="dl-app" style={{
      height: "100dvh", background: BG, color: CREAM, fontFamily: FONT,
      display: "flex", justifyContent: "center", alignItems: "center",
      overflow: "hidden", overscrollBehavior: "none", position: "relative",
    }}>
      <DraftTheme />
      <Backdrop weight={atmos} />
      <div style={{
        width: "100%", maxWidth: 520,
        height: wide ? "calc(100dvh - 34px)" : "100dvh",
        position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: glow ? wash(glow, 16) : PAPER,
        border: wide ? `${BW_3}px solid ${LINE}` : "none",
        borderRadius: wide ? 26 : 0,
        boxShadow: wide ? `9px 9px 0 ${LINE}` : "none",
      }}>
        {head}
        <div style={{
          flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch", padding: pad ? "0 12px" : 0, position: "relative", zIndex: 1,
        }}>
          {children}
        </div>
        {foot}
        {tab !== null && tab !== undefined && <TabBar active={tab} />}
      </div>
    </div>
  );
}

/**
 * The band at the top of every screen.
 *
 * The title is centred and the back arrow and right slot float over it, so every
 * screen names itself in the same place whether or not it has a back button.
 *
 * `accent` is a FILL: it becomes the highlighter stroke under the title, which is
 * how the films carry state in a header. Passing a readable colour here paints a
 * solid block over the words, so the call sites hand it `LEMON`, `PINK`, `MINT`.
 */
export function Band({
  title, sub, right, onBack, accent = LEMON, children, compact,
}: {
  title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode;
  onBack?: () => void; accent?: string; children?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div style={{
      flex: "0 0 auto", position: "relative", zIndex: 20,
      background: PAPER, borderBottom: `${BW_3}px solid ${LINE}`,
      padding: `calc(14px + env(safe-area-inset-top)) 12px ${children ? 13 : 14}px`,
    }}>
      <div style={{ position: "relative", minHeight: compact ? 40 : 46, display: "grid", placeItems: "center" }}>
        {/* The back arrow and the right slot float OVER this row so the title
            sits in the same place on every screen. That only works if the title
            is narrow enough to clear whichever of them is present — at a flat
            64% a two-icon right slot printed straight through the subtitle on a
            390px phone. */}
        <div style={{ maxWidth: right ? "58%" : onBack ? "72%" : "84%", textAlign: "center" }}>
          {/* The header is the screen's name and it is meant to be read across a
              room, not squinted at: this is roughly a third larger than a normal
              app bar, which is the point. It scales with the viewport so the
              same title survives a 360px phone and a 520px sheet. */}
          <div style={{
            fontSize: compact ? "clamp(18px, 5.4vw, 22px)" : "clamp(22px, 6.8vw, 28px)",
            fontWeight: 900, letterSpacing: "-.035em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.16,
            color: CREAM,
          }}>
            <Mark c={accent}>{title}</Mark>
          </div>
          {sub && (
            <div style={{ fontSize: 11, color: DIM, marginTop: 5, letterSpacing: .3, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          )}
        </div>

        {onBack && (
          <button onClick={onBack} aria-label="Back" className="dl-btn" style={{
            position: "absolute", left: 0, top: "50%", marginTop: -18,
            width: 36, height: 36, borderRadius: R_BTN,
            background: PANEL, border: `${BW}px solid ${LINE}`, color: CREAM,
            fontSize: 19, fontWeight: 900, cursor: "pointer", display: "grid", placeItems: "center",
            padding: 0, lineHeight: 1, ...lift(2),
          }}>‹</button>
        )}
        {right && (
          <div style={{ position: "absolute", right: 0, top: "50%", marginTop: -16, minHeight: 32, display: "flex", alignItems: "center", gap: 6 }}>
            {right}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- tab bar */

export type Tab = "duel" | "picker" | "guide";

const ICONS: Record<Tab, React.ReactNode> = {
  duel: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" />
      <path d="M19 3h2v2l-9 9" />
    </svg>
  ),
  picker: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4" />
    </svg>
  ),
  guide: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H11v18H4.5A2.5 2.5 0 0 0 2 22z" />
      <path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H13v18h6.5a2.5 2.5 0 0 1 2.5 2z" />
    </svg>
  ),
};

const TABS: { id: Tab; href: string; label: string; fill: string }[] = [
  { id: "duel", href: "/draft", label: "Duel", fill: PINK },
  { id: "picker", href: "/draft/picker", label: "Picker", fill: MINT },
  { id: "guide", href: "/draft/guide", label: "Guide", fill: LILAC },
];

/** Three stickers on a paper strip. The live one is filled; the rest are outline. */
export function TabBar({ active }: { active: Tab }) {
  return (
    <nav style={{
      flex: "0 0 auto", display: "flex", gap: 7, zIndex: 30,
      borderTop: `${BW_2}px solid ${LINE}`, background: PAPER,
      padding: "9px 10px calc(9px + env(safe-area-inset-bottom))",
    }}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <a key={t.id} href={t.href} className="dl-btn" style={{
            flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            textDecoration: "none", padding: "8px 2px 6px", borderRadius: R_CHIP, minHeight: 52,
            color: on ? ON_FILL : CREAM,
            background: on ? t.fill : PANEL,
            border: `${BW}px solid ${LINE}`,
            ...lift(on ? 3 : 2),
          }}>
            {ICONS[t.id]}
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: .8 }}>{t.label.toUpperCase()}</span>
          </a>
        );
      })}
    </nav>
  );
}

/** Which tab a path belongs to — used by the pages so the bar never disagrees. */
export function useTab(): Tab {
  const p = usePathname();
  if (p?.startsWith("/draft/guide")) return "guide";
  if (p?.startsWith("/draft/picker")) return "picker";
  return "duel";
}

/* ------------------------------------------------------------- controls */

/**
 * Segmented control — the default for any two-or-three-way choice.
 *
 * The track is an ink-outlined pill and the live segment is a pastel fill inside
 * it, so the control is one sticker rather than two competing ones.
 */
export function Segment<T extends string>({
  value, onChange, options, accent = LEMON, dense,
}: {
  value: T; onChange: (v: T) => void;
  options: { v: T; label: string; accent?: string; dot?: string }[];
  accent?: string; dense?: boolean;
}) {
  return (
    <div style={{
      display: "flex", gap: 3, padding: 3, borderRadius: R_BTN,
      background: PANEL, border: `${BW}px solid ${LINE}`, boxShadow: `3px 3px 0 ${LINE}`,
    }}>
      {options.map((o) => {
        const on = o.v === value;
        const c = o.accent ?? accent;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} className="dl-btn dl-flat" style={{
            flex: "1 1 0", padding: dense ? "6px 4px" : "8px 6px", borderRadius: R_BTN, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            background: on ? c : "transparent", color: on ? ON_FILL : DIM,
            fontSize: dense ? 11 : 12, fontWeight: 900, letterSpacing: .4, cursor: "pointer",
            minHeight: dense ? 28 : 32, fontFamily: "inherit",
          }}>
            {o.dot && <span style={{ width: 7, height: 7, borderRadius: 4, background: on ? ON_FILL : o.dot, flexShrink: 0 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Action button.
 *
 * A pill with an ink outline and a hard shadow that presses into the page. The
 * tone is the FILL, never the readable accent: on cream, a saturated red button
 * with white text is the one thing in this palette that reads as another site.
 */
export function Btn({
  children, onClick, tone = "gold", disabled, full, size = "m", href,
}: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  tone?: "gold" | "red" | "green" | "ghost" | "dark" | "lilac"; disabled?: boolean; full?: boolean;
  size?: "s" | "m" | "l";
  /** @deprecated glows are gone — the shadow is the affordance now. */
  glow?: boolean;
}) {
  const fills: Record<string, string> = {
    red: PINK, gold: GOLD_FILL, green: MINT, lilac: LILAC, ghost: "transparent", dark: PANEL,
  };
  const bg = fills[tone] ?? GOLD_FILL;
  const fg = tone === "ghost" || tone === "dark" ? CREAM : ON_FILL;
  const pad = size === "s" ? "7px 14px" : size === "l" ? "14px 22px" : "10px 18px";
  const fs = size === "s" ? 11.5 : size === "l" ? 15 : 13;
  const mh = size === "s" ? 34 : size === "l" ? 50 : 42;
  const depth = size === "l" ? 4 : 3;

  const style: React.CSSProperties = {
    width: full ? "100%" : undefined, padding: pad, borderRadius: R_BTN,
    border: `${size === "l" ? BW_2 : BW}px solid ${LINE}`,
    background: disabled ? "var(--disabled)" : bg, color: disabled ? DIM : fg,
    fontSize: fs, fontWeight: 900, letterSpacing: .6, textAlign: "center", textTransform: "uppercase",
    // Labels are verbs of one or two words and must never wrap: a narrow slot
    // should clip or shrink the button, not turn SIGN IN into two lines.
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer", textDecoration: "none", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    minHeight: mh, ...lift(depth),
  };
  if (href) return <a className="dl-btn" href={href} style={style}>{children}</a>;
  return <button className="dl-btn" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="dl-card" style={{ padding: "13px 15px", ...style }}>{children}</div>
  );
}

export function Label({ children, color = DIM, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 9.5, letterSpacing: 1.5, color, fontWeight: 900, marginBottom: 7, textTransform: "uppercase", ...style }}>{children}</div>;
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", background: "var(--field)", border: `${BW}px solid ${LINE}`, color: CREAM,
        padding: "10px 14px", borderRadius: R_BTN, fontSize: 16, outline: "none", boxSizing: "border-box",
        fontFamily: "inherit", fontWeight: 700, boxShadow: `3px 3px 0 ${LINE}`,
        ...props.style,
      }}
    />
  );
}

/** A small switch. One of these controls bans for both solo and live. */
export function Toggle({
  checked, onChange, label, color = LEMON,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)} className="dl-btn dl-flat" role="switch" aria-checked={checked}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9, background: "none", border: "none",
        padding: "4px 2px", cursor: "pointer", color: CREAM, minHeight: 34, fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: .8 }}>{label}</span>
      <span style={{
        width: 42, height: 24, borderRadius: R_BTN, flexShrink: 0, position: "relative",
        background: checked ? color : PANEL, border: `${BW}px solid ${LINE}`, boxSizing: "border-box",
        transition: "background var(--t) var(--ease)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 20 : 2, width: 15, height: 15, borderRadius: 8,
          background: ON_FILL, transition: "left var(--t) var(--ease)",
        }} />
      </span>
    </button>
  );
}

/** A round icon button — the shape both the speaker and the sheet switch take. */
function IconBtn({
  onClick, label, title, on, fill = LEMON, children,
}: { onClick: () => void; label: string; title?: string; on?: boolean; fill?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="dl-btn" aria-label={label} title={title} style={{
      width: 32, height: 32, borderRadius: R_BTN, background: on ? fill : PANEL,
      border: `${BW}px solid ${LINE}`, color: on ? ON_FILL : DIM,
      cursor: "pointer", display: "grid", placeItems: "center", padding: 0, ...lift(2),
    }}>{children}</button>
  );
}

/** Speaker toggle. Sound is on by default; this is how you turn it off for good. */
export function SoundToggle() {
  const [muted, setMuted] = useMuted();
  return (
    <IconBtn onClick={() => setMuted(!muted)} on={!muted} fill={MINT}
      label={muted ? "Turn sound on" : "Turn sound off"} title={muted ? "Sound off" : "Sound on"}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {muted ? <><path d="m23 9-6 6" /><path d="m17 9 6 6" /></> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      </svg>
    </IconBtn>
  );
}

/**
 * Paper or night, sitting next to the speaker.
 *
 * Both sheets are the same design — ink outlines, hard shadows, the same
 * pastels. Night only inverts the paper and the stroke, so this is a lamp
 * switch rather than a second theme.
 */
export function ThemeToggle() {
  const [night, setNight] = useNight();
  return (
    <IconBtn onClick={() => setNight(!night)} on={night} fill={LILAC}
      label={night ? "Switch to paper" : "Switch to night"} title={night ? "Night" : "Paper"}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        {night ? (
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z" />
        ) : (
          <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>
        )}
      </svg>
    </IconBtn>
  );
}

/**
 * The single most important thing on a drafting screen: is it my turn?
 * It sits first, largest, and is the only thing that pulses.
 */
export function TurnBanner({ active, label, accent = LEMON }: { active: boolean; label: string; accent?: string }) {
  return (
    <div className={active ? "dl-turn" : undefined} style={{
      textAlign: "center", padding: "11px 12px", borderRadius: R_BTN, marginTop: 9,
      background: active ? accent : PANEL,
      border: `${BW}px solid ${LINE}`, boxShadow: `3px 3px 0 ${LINE}`,
    }}>
      <span style={{
        fontSize: "clamp(13px, 4vw, 16px)", fontWeight: 900, letterSpacing: .7,
        color: active ? ON_FILL : DIM,
      }}>{label}</span>
    </div>
  );
}

/**
 * The pick → ban → pick progression.
 *
 * A sixteen-step bans draft does not fit on a phone at once, so the active step
 * auto-scrolls to the centre. The point is "where am I in this", not an inventory.
 */
export function DraftTimeline({
  seq, current, mineRole,
}: { seq: { role: 0 | 1; kind: "pick" | "ban" }[]; current: number; mineRole: 0 | 1 }) {
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trackRef.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [current]);
  return (
    <div ref={trackRef} style={{
      display: "flex", gap: 5, overflowX: "auto", padding: "3px 1px 4px",
      WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity",
    }}>
      {seq.map((s, i) => {
        const mine = s.role === mineRole;
        const fill = s.kind === "ban" ? DANGER_FILL : mine ? ALLY_FILL : ENEMY_FILL;
        const done = i < current, active = i === current;
        return (
          <div key={i} style={{
            flexShrink: 0, width: active ? 22 : 14, height: active ? 22 : 14,
            borderRadius: s.kind === "ban" ? 5 : 999,
            background: active || done ? fill : "transparent",
            opacity: done && !active ? .5 : 1,
            border: `2px solid ${LINE}`, boxSizing: "border-box",
            display: "grid", placeItems: "center", scrollSnapAlign: "center",
            boxShadow: active ? `2px 2px 0 ${LINE}` : "none",
            transition: "width var(--t) var(--ease), height var(--t) var(--ease)",
          }}>
            {s.kind === "ban" && (active || done) && (
              <span style={{ fontSize: active ? 11 : 8, color: ON_FILL, fontWeight: 900, lineHeight: 1 }}>×</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Pips({ total, filled, color = LEMON }: { total: number; filled: number; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i < filled ? 14 : 7, height: 7, borderRadius: 4, boxSizing: "border-box",
          background: i < filled ? color : "transparent", border: `2px solid ${LINE}`,
          transition: "width var(--t) var(--ease), background var(--t) var(--ease)",
        }} />
      ))}
    </div>
  );
}

/**
 * Head-to-head strength bar — a meter in an ink capsule, the same one the
 * landing page fills for tournament slots.
 */
export function VersusBar({ p, left, right, small }: { p: number; left: string; right: string; small?: boolean }) {
  const pct = Math.max(0, Math.min(100, p * 100));
  return (
    <div>
      {/* The two names sit between the two numbers and must never touch them:
          at 27px tabular digits there is no optical gap, so "26.8%YOU · THE
          COUNTERPICKER73.2%" ran together as one string. The label is the part
          that gives way — it shrinks and ellipsises, the numbers never do. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 9, marginBottom: 7 }}>
        <span style={{ flexShrink: 0, fontSize: small ? 19 : 27, fontWeight: 900, color: ALLY, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em" }}>
          {pct.toFixed(1)}%
        </span>
        <span style={{
          minWidth: 0, fontSize: 9, letterSpacing: 1.1, color: DIM, fontWeight: 900,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center",
        }}>{left} · {right}</span>
        <span style={{ flexShrink: 0, fontSize: small ? 19 : 27, fontWeight: 900, color: ENEMY, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em" }}>
          {(100 - pct).toFixed(1)}%
        </span>
      </div>
      <div style={{
        height: small ? 13 : 17, background: ENEMY_FILL, borderRadius: R_BTN, overflow: "hidden",
        border: `${BW}px solid ${LINE}`, boxSizing: "border-box",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: ALLY_FILL,
          borderRight: pct > 2 && pct < 98 ? `${BW}px solid ${LINE}` : "none",
          boxSizing: "border-box", transition: "width .8s var(--ease)",
        }} />
      </div>
    </div>
  );
}

/**
 * Signed percentage, coloured.
 *
 * `forThem` inverts the colour, because the same number means the opposite thing
 * depending on whose list it is: a hero worth +6% to the enemy is the worst news
 * on the screen, and painting it green said the reverse.
 */
export function Delta({ v, size = 13, forThem }: { v: number; size?: number; forThem?: boolean }) {
  const good = forThem ? v < 0 : v >= 0;
  return (
    <span style={{
      fontSize: size, fontWeight: 900, fontVariantNumeric: "tabular-nums",
      color: ON_FILL, background: good ? MINT : PINK, border: `1.5px solid ${LINE}`,
      borderRadius: R_BTN, padding: "1px 5px", flexShrink: 0, lineHeight: 1.35,
    }}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>
  );
}

/**
 * A number that counts up to its target.
 *
 * Results are the payoff screen, and a score that simply appears reads as data
 * where a score that climbs reads as an outcome. Driven by rAF and eased, so it
 * decelerates into the final value instead of stopping dead.
 */
export function CountUp({
  to, dur = 1100, decimals = 0, suffix = "", style, onDone,
}: { to: number; dur?: number; decimals?: number; suffix?: string; style?: React.CSSProperties; onDone?: () => void }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(to * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else if (!doneRef.current) { doneRef.current = true; onDone?.(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, dur]);
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{n.toFixed(decimals)}{suffix}</span>;
}
