"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DraftTheme, FONT } from "./theme";
import { useMuted } from "./sound";

/* ------------------------------------------------------------------ tokens
 *
 * These mirror the CSS custom properties in `theme.tsx`. Both exist because the
 * app builds translucent variants by concatenation — `${ENEMY}44` — which a
 * `var()` cannot do. Keep the two files in step.
 */

export const BG = "#0B0E14";
export const PANEL = "#12161F";      // elevated surface
export const PANEL_2 = "#181D28";    // secondary surface
export const LINE = "rgba(255,255,255,0.06)";
export const LINE_HI = "rgba(255,255,255,0.12)";
export const CREAM = "#E8EAED";
export const MUTED = "#8B95A8";
export const DIM = "#5C6577";

export const RED = "#FF3B3B";        // primary CTA / solo
export const GOLD = "#F5A623";       // secondary / live
export const GREEN = "#00E676";      // success, correct, positive delta
export const DANGER = "#FF1744";     // ban, wrong
export const ALLY = "#00B0FF";       // your side
export const ENEMY = "#FF5252";      // their side
export const BLUE = ALLY;

export const GLOW_PRIMARY = "0 0 24px rgba(255, 59, 59, 0.45)";
export const GLOW_GOLD = "0 0 24px rgba(245, 166, 35, 0.40)";
export const GLOW_SUCCESS = "0 0 20px rgba(0, 230, 118, 0.35)";

export const R_CARD = 16, R_BTN = 12, R_CHIP = 8;

export const attrColor = (a: string) => (a === "str" ? ENEMY : a === "agi" ? GREEN : a === "int" ? ALLY : "#C77DFF");

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

/* ------------------------------------------------------------------- frame */

/**
 * The app frame.
 *
 * The stage is exactly one viewport tall and does not scroll — only `children`
 * does, between a pinned `head` and a pinned `foot`. Every control that gets used
 * repeatedly therefore stays under the thumb no matter how long the list below
 * it grows.
 *
 * It also carries `.dl-app`, which is where the whole token system is scoped, and
 * renders the theme itself so no page has to remember to.
 */
export function Shell({
  head, children, foot, tab, pad = true, glow,
}: {
  head?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  tab?: Tab | null;
  pad?: boolean;
  /** Ambient colour wash behind the stage, e.g. the winner's colour on a result. */
  glow?: string;
}) {
  return (
    <div className="dl-app" style={{
      height: "100dvh", background: BG, color: CREAM, fontFamily: FONT,
      display: "flex", justifyContent: "center", overflow: "hidden", overscrollBehavior: "none",
    }}>
      <DraftTheme />
      <div style={{
        width: "100%", maxWidth: 520, height: "100dvh", position: "relative",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: glow
          ? `radial-gradient(120% 55% at 50% 0%, ${glow}22, ${BG} 62%)`
          : `radial-gradient(120% 50% at 50% 0%, rgba(255,255,255,.028), ${BG} 60%)`,
        boxShadow: "0 0 90px rgba(0,0,0,.85)",
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
 */
export function Band({
  title, sub, right, onBack, accent = GOLD, children, compact,
}: {
  title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode;
  onBack?: () => void; accent?: string; children?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div style={{
      flex: "0 0 auto", position: "relative", zIndex: 20,
      background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0d 46%, rgba(11,14,20,0) 100%)`,
      borderBottom: `1px solid ${LINE}`,
      backdropFilter: "blur(10px)",
      padding: `calc(10px + env(safe-area-inset-top)) 12px ${children ? 11 : 10}px`,
    }}>
      <div style={{ position: "relative", minHeight: compact ? 30 : 34, display: "grid", placeItems: "center" }}>
        <div style={{ maxWidth: "66%", textAlign: "center" }}>
          <div style={{
            fontSize: compact ? 15.5 : 18, fontWeight: 800, letterSpacing: -0.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15,
          }}>{title}</div>
          {sub && (
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2, letterSpacing: .3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          )}
        </div>

        {onBack && (
          <button onClick={onBack} aria-label="Back" className="dl-btn" style={{
            position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
            width: 32, height: 32, borderRadius: R_CHIP,
            background: PANEL_2, border: `1px solid ${LINE}`, color: CREAM,
            fontSize: 17, cursor: "pointer", display: "grid", placeItems: "center", padding: 0, lineHeight: 1,
          }}>‹</button>
        )}
        {right && (
          <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" />
      <path d="M19 3h2v2l-9 9" />
    </svg>
  ),
  picker: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4" />
    </svg>
  ),
  guide: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2H11v18H4.5A2.5 2.5 0 0 0 2 22z" />
      <path d="M22 4.5A2.5 2.5 0 0 0 19.5 2H13v18h6.5a2.5 2.5 0 0 1 2.5 2z" />
    </svg>
  ),
};

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: "duel", href: "/draft", label: "Duel" },
  { id: "picker", href: "/draft/picker", label: "Picker" },
  { id: "guide", href: "/draft/guide", label: "Guide" },
];

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav style={{
      flex: "0 0 auto", display: "flex", gap: 4, zIndex: 30,
      borderTop: `1px solid ${LINE}`, background: "rgba(8,11,18,.92)", backdropFilter: "blur(14px)",
      padding: "7px 8px calc(7px + env(safe-area-inset-bottom))",
    }}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <a key={t.id} href={t.href} className="dl-btn" style={{
            flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            textDecoration: "none", padding: "8px 2px 6px", borderRadius: R_BTN, minHeight: 52,
            color: on ? RED : DIM,
            background: on ? "rgba(255,59,59,.12)" : "transparent",
            border: `1px solid ${on ? "rgba(255,59,59,.32)" : "transparent"}`,
            boxShadow: on ? "0 0 20px -6px rgba(255,59,59,.6)" : "none",
          }}>
            {ICONS[t.id]}
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .6 }}>{t.label.toUpperCase()}</span>
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

/** Segmented control — the default for any two-or-three-way choice. */
export function Segment<T extends string>({
  value, onChange, options, accent = GOLD, dense,
}: {
  value: T; onChange: (v: T) => void;
  options: { v: T; label: string; accent?: string; dot?: string }[];
  accent?: string; dense?: boolean;
}) {
  return (
    <div style={{
      display: "flex", gap: 3, padding: 3, borderRadius: R_BTN,
      background: "rgba(0,0,0,.32)", border: `1px solid ${LINE}`,
    }}>
      {options.map((o) => {
        const on = o.v === value;
        const c = o.accent ?? accent;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} className="dl-btn" style={{
            flex: "1 1 0", padding: dense ? "7px 4px" : "9px 6px", borderRadius: R_CHIP, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            background: on ? c : "transparent", color: on ? "#08111A" : MUTED,
            fontSize: dense ? 11 : 12, fontWeight: 800, letterSpacing: .3, cursor: "pointer",
            boxShadow: on ? `0 0 18px -6px ${c}` : "none", minHeight: dense ? 30 : 34,
          }}>
            {o.dot && <span style={{ width: 6, height: 6, borderRadius: 4, background: on ? "#08111A" : o.dot, flexShrink: 0 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Action button. Glow scales with prominence; the label is a verb. */
export function Btn({
  children, onClick, tone = "gold", disabled, full, size = "m", href, glow,
}: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  tone?: "gold" | "red" | "green" | "ghost" | "dark"; disabled?: boolean; full?: boolean;
  size?: "s" | "m" | "l"; glow?: boolean;
}) {
  const tones: Record<string, { bg: string; fg: string; shadow: string; border: string }> = {
    red: { bg: `linear-gradient(180deg, ${RED}, #D92B2B)`, fg: "#FFF", shadow: GLOW_PRIMARY, border: "none" },
    gold: { bg: `linear-gradient(180deg, ${GOLD}, #D68A12)`, fg: "#1A1103", shadow: GLOW_GOLD, border: "none" },
    green: { bg: `linear-gradient(180deg, ${GREEN}, #00B85E)`, fg: "#04160B", shadow: GLOW_SUCCESS, border: "none" },
    ghost: { bg: "transparent", fg: CREAM, shadow: "none", border: `1px solid ${LINE_HI}` },
    dark: { bg: PANEL_2, fg: CREAM, shadow: "none", border: `1px solid ${LINE}` },
  };
  const t = tones[tone];
  const pad = size === "s" ? "8px 13px" : size === "l" ? "15px 22px" : "11px 17px";
  const fs = size === "s" ? 11.5 : size === "l" ? 15 : 13;
  const mh = size === "s" ? 34 : size === "l" ? 52 : 42;
  const flat = tone === "ghost" || tone === "dark";
  const style: React.CSSProperties = {
    width: full ? "100%" : undefined, padding: pad, borderRadius: R_BTN, border: t.border,
    background: disabled ? "#1B2130" : t.bg, color: disabled ? DIM : t.fg,
    fontSize: fs, fontWeight: 800, letterSpacing: .3, textAlign: "center",
    cursor: disabled ? "not-allowed" : "pointer", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    boxShadow: disabled || flat ? "none" : glow === false ? `0 6px 18px -10px ${t.shadow}` : t.shadow,
    minHeight: mh,
  };
  if (href) return <a className="dl-btn" href={href} style={style}>{children}</a>;
  return <button className="dl-btn" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="dl-card" style={{
      background: PANEL, border: `1px solid ${LINE}`, borderRadius: R_CARD,
      padding: "13px 14px", ...style,
    }}>{children}</div>
  );
}

export function Label({ children, color = MUTED, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 9.5, letterSpacing: 1.5, color, fontWeight: 800, marginBottom: 7, ...style }}>{children}</div>;
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", background: "rgba(0,0,0,.32)", border: `1px solid ${LINE}`, color: CREAM,
        padding: "11px 13px", borderRadius: R_BTN, fontSize: 16, outline: "none", boxSizing: "border-box",
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}

/** A small switch. One of these controls bans for both solo and live. */
export function Toggle({
  checked, onChange, label, color = GOLD,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)} className="dl-btn" role="switch" aria-checked={checked}
      style={{
        display: "inline-flex", alignItems: "center", gap: 9, background: "none", border: "none",
        padding: "4px 2px", cursor: "pointer", color: checked ? color : MUTED, minHeight: 34,
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: .6 }}>{label}</span>
      <span style={{
        width: 38, height: 21, borderRadius: 11, flexShrink: 0, position: "relative",
        background: checked ? color : "rgba(255,255,255,.13)",
        boxShadow: checked ? `0 0 16px -4px ${color}` : "none",
        transition: "background var(--t) var(--ease), box-shadow var(--t) var(--ease)",
      }}>
        <span style={{
          position: "absolute", top: 3, left: checked ? 20 : 3, width: 15, height: 15, borderRadius: 8,
          background: checked ? "#0B0E14" : "#C6CDDA",
          transition: "left var(--t) var(--ease)",
        }} />
      </span>
    </button>
  );
}

/** Speaker toggle. Sound is on by default; this is how you turn it off for good. */
export function SoundToggle() {
  const [muted, setMuted] = useMuted();
  return (
    <button
      onClick={() => setMuted(!muted)} className="dl-btn"
      aria-label={muted ? "Turn sound on" : "Turn sound off"} title={muted ? "Sound off" : "Sound on"}
      style={{
        width: 32, height: 32, borderRadius: R_CHIP, background: PANEL_2, border: `1px solid ${LINE}`,
        color: muted ? DIM : CREAM, cursor: "pointer", display: "grid", placeItems: "center", padding: 0,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {muted ? <><path d="m23 9-6 6" /><path d="m17 9 6 6" /></> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
      </svg>
    </button>
  );
}

/**
 * The single most important thing on a drafting screen: is it my turn?
 * It sits first, largest, and is the only thing that pulses.
 */
export function TurnBanner({ active, label, accent = GOLD }: { active: boolean; label: string; accent?: string }) {
  return (
    <div className={active ? "dl-turn" : undefined} style={{
      textAlign: "center", padding: "11px 10px", borderRadius: R_BTN, marginTop: 9,
      background: active ? `${accent}1f` : "rgba(255,255,255,.025)",
      border: `1px solid ${active ? accent + "59" : LINE}`,
      boxShadow: active ? `0 0 26px -10px ${accent}` : "none",
    }}>
      <span style={{
        fontSize: "clamp(13px, 4vw, 16px)", fontWeight: 800, letterSpacing: .7,
        color: active ? accent : MUTED,
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
        const c = s.kind === "ban" ? DANGER : mine ? ALLY : ENEMY;
        const done = i < current, active = i === current;
        return (
          <div key={i} style={{
            flexShrink: 0, width: active ? 22 : 14, height: active ? 22 : 14,
            borderRadius: s.kind === "ban" ? 4 : 999,
            background: active ? c : done ? `${c}4d` : "rgba(255,255,255,.06)",
            border: `1px solid ${active ? c : done ? `${c}80` : LINE}`,
            display: "grid", placeItems: "center", scrollSnapAlign: "center",
            boxShadow: active ? `0 0 12px -2px ${c}` : undefined,
            transition: "width var(--t) var(--ease), height var(--t) var(--ease)",
          }}>
            {s.kind === "ban" && (active || done) && (
              <span style={{ fontSize: active ? 11 : 8, color: "#0B0E14", fontWeight: 900, lineHeight: 1 }}>×</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Pips({ total, filled, color = GOLD }: { total: number; filled: number; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i < filled ? 13 : 6, height: 5, borderRadius: 3,
          background: i < filled ? color : "rgba(255,255,255,.11)",
          boxShadow: i < filled ? `0 0 8px -2px ${color}` : "none",
          transition: "width var(--t) var(--ease), background var(--t) var(--ease)",
        }} />
      ))}
    </div>
  );
}

/** Head-to-head strength bar. Compact enough to sit inside a pinned band. */
export function VersusBar({ p, left, right, small }: { p: number; left: string; right: string; small?: boolean }) {
  const pct = Math.max(0, Math.min(100, p * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: small ? 19 : 26, fontWeight: 800, color: ALLY, fontVariantNumeric: "tabular-nums", lineHeight: 1, textShadow: `0 0 20px ${ALLY}55` }}>
          {pct.toFixed(1)}%
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1.2, color: MUTED, fontWeight: 800 }}>{left} · {right}</span>
        <span style={{ fontSize: small ? 19 : 26, fontWeight: 800, color: ENEMY, fontVariantNumeric: "tabular-nums", lineHeight: 1, textShadow: `0 0 20px ${ENEMY}55` }}>
          {(100 - pct).toFixed(1)}%
        </span>
      </div>
      <div style={{ height: small ? 8 : 11, background: `linear-gradient(90deg, #6E2226, ${ENEMY})`, borderRadius: 6, overflow: "hidden", border: `1px solid ${LINE}` }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${ALLY}, #0087C7)`, boxShadow: `0 0 16px ${ALLY}`,
          transition: "width .8s var(--ease)",
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
      fontSize: size, fontWeight: 800, fontVariantNumeric: "tabular-nums",
      color: good ? GREEN : ENEMY, flexShrink: 0,
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
