"use client";

import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ tokens */

export const BG = "#07060a";
export const PANEL = "#131019";
export const PANEL_2 = "#1b1725";
export const LINE = "#2a2438";
export const CREAM = "#F3F0EA";
export const MUTED = "#8B8399";
export const DIM = "#5d566e";
export const RED = "#E0453A";
export const GREEN = "#3FBF6A";
export const GOLD = "#F5B93B";
export const BLUE = "#4C9BF5";

export const attrColor = (a: string) => (a === "str" ? RED : a === "agi" ? GREEN : a === "int" ? BLUE : "#C77DFF");

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
 * This is the one structural rule the whole redesign rests on: the stage is
 * exactly one viewport tall and does not scroll. Only `children` scrolls, between
 * a pinned `head` and a pinned `foot`. Every control that matters — the side you
 * are picking for, the search box, the tab bar, REMATCH — therefore stays under
 * the thumb no matter how long the list below it gets. The previous version put
 * all of it in one long document, so choosing a team or starting a rematch meant
 * scrolling back up to find the button.
 *
 * On a wide screen it centres a phone-shaped stage rather than stretching, so the
 * layout everyone sees is the one it was designed for.
 */
export function Shell({
  head, children, foot, tab, pad = true,
}: {
  head?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  tab?: Tab | null;
  pad?: boolean;
}) {
  return (
    <div style={{
      height: "100dvh", background: BG, color: CREAM,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      display: "flex", justifyContent: "center", overflow: "hidden",
      overscrollBehavior: "none",
    }}>
      <div style={{
        width: "100%", maxWidth: 520, height: "100dvh", position: "relative",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: BG, boxShadow: "0 0 90px rgba(0,0,0,.8)",
      }}>
        {head}
        <div style={{
          flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          padding: pad ? "0 12px" : 0,
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
 * Coloured, not black, so the app reads as a game rather than a document — and so
 * the pinned controls inside it are visibly a separate layer from the list that
 * scrolls under them.
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
      background: `linear-gradient(180deg, ${accent}2e 0%, ${accent}12 42%, ${BG} 100%)`,
      borderBottom: `1px solid ${LINE}`,
      padding: `calc(9px + env(safe-area-inset-top)) 12px ${children ? 10 : 9}px`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, minHeight: compact ? 28 : 32 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="dl-btn" style={{
            width: 30, height: 30, flexShrink: 0, borderRadius: 9,
            background: "rgba(255,255,255,.07)", border: `1px solid ${LINE}`, color: CREAM,
            fontSize: 16, cursor: "pointer", display: "grid", placeItems: "center", padding: 0, lineHeight: 1,
          }}>‹</button>
        )}
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{
            fontSize: compact ? 15 : 17, fontWeight: 900, letterSpacing: -0.35,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15,
          }}>{title}</div>
          {sub && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- tab bar */

export type Tab = "duel" | "picker" | "guide";

const ICONS: Record<Tab, React.ReactNode> = {
  duel: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" />
      <path d="M19 3h2v2l-9 9" />
    </svg>
  ),
  picker: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4" />
    </svg>
  ),
  guide: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      flex: "0 0 auto", display: "flex", zIndex: 30,
      borderTop: `1px solid ${LINE}`, background: "#0b0910",
      padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
    }}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <a key={t.id} href={t.href} style={{
            flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            textDecoration: "none", padding: "5px 2px 3px", borderRadius: 11,
            color: on ? GOLD : DIM, background: on ? `${GOLD}14` : "transparent",
          }}>
            {ICONS[t.id]}
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .5 }}>{t.label.toUpperCase()}</span>
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
 * Segmented control — the app's default for any two-or-three-way choice.
 *
 * Small and always visible beats a big button that has to be scrolled to.
 */
export function Segment<T extends string>({
  value, onChange, options, accent = GOLD, dense,
}: {
  value: T; onChange: (v: T) => void;
  options: { v: T; label: string; accent?: string; dot?: string }[];
  accent?: string; dense?: boolean;
}) {
  return (
    <div style={{
      display: "flex", gap: 3, padding: 3, borderRadius: 11,
      background: "rgba(0,0,0,.35)", border: `1px solid ${LINE}`,
    }}>
      {options.map((o) => {
        const on = o.v === value;
        const c = o.accent ?? accent;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} className="dl-btn" style={{
            flex: "1 1 0", padding: dense ? "6px 4px" : "8px 6px", borderRadius: 9, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            background: on ? c : "transparent", color: on ? "#0b0810" : MUTED,
            fontSize: dense ? 11 : 12, fontWeight: 900, letterSpacing: .3, cursor: "pointer",
            boxShadow: on ? `0 2px 12px -4px ${c}` : "none", minHeight: dense ? 28 : 32,
          }}>
            {o.dot && <span style={{ width: 6, height: 6, borderRadius: 4, background: on ? "#0b0810" : o.dot, flexShrink: 0 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact action button. Text stays short — the label is a verb, not a sentence. */
export function Btn({
  children, onClick, tone = "gold", disabled, full, size = "m", href,
}: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  tone?: "gold" | "red" | "green" | "ghost" | "dark"; disabled?: boolean; full?: boolean;
  size?: "s" | "m" | "l";
}) {
  const tones: Record<string, { bg: string; fg: string; glow: string; border: string }> = {
    gold: { bg: `linear-gradient(180deg, ${GOLD}, #d99a22)`, fg: "#140f06", glow: GOLD, border: "none" },
    red: { bg: `linear-gradient(180deg, ${RED}, #a82a22)`, fg: "#fff", glow: RED, border: "none" },
    green: { bg: `linear-gradient(180deg, ${GREEN}, #2b8f4c)`, fg: "#04120a", glow: GREEN, border: "none" },
    ghost: { bg: "transparent", fg: CREAM, glow: "transparent", border: `1px solid ${LINE}` },
    dark: { bg: PANEL_2, fg: CREAM, glow: "transparent", border: `1px solid ${LINE}` },
  };
  const t = tones[tone];
  const pad = size === "s" ? "7px 12px" : size === "l" ? "13px 20px" : "10px 16px";
  const fs = size === "s" ? 11.5 : size === "l" ? 14 : 12.5;
  const mh = size === "s" ? 32 : size === "l" ? 46 : 38;
  const style: React.CSSProperties = {
    width: full ? "100%" : undefined, padding: pad, borderRadius: 10, border: t.border,
    background: disabled ? "#221f2e" : t.bg, color: disabled ? DIM : t.fg,
    fontSize: fs, fontWeight: 900, letterSpacing: .4, textAlign: "center",
    cursor: disabled ? "not-allowed" : "pointer", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    boxShadow: disabled || tone === "ghost" || tone === "dark" ? "none" : `0 4px 16px -8px ${t.glow}`,
    minHeight: mh,
  };
  if (href) return <a className="dl-btn" href={href} style={style}>{children}</a>;
  return <button className="dl-btn" onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14,
      padding: "11px 12px", ...style,
    }}>{children}</div>
  );
}

export function Label({ children, color = MUTED, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 9.5, letterSpacing: 1.5, color, fontWeight: 900, marginBottom: 6, ...style }}>{children}</div>;
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", background: "rgba(0,0,0,.4)", border: `1px solid ${LINE}`, color: CREAM,
        padding: "9px 12px", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

export function Pips({ total, filled, color = GOLD }: { total: number; filled: number; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i < filled ? 12 : 6, height: 4, borderRadius: 3,
          background: i < filled ? color : "#2b2740", transition: "width .25s, background .25s",
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: small ? 18 : 24, fontWeight: 900, color: GREEN, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {pct.toFixed(1)}%
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1.2, color: MUTED, fontWeight: 800 }}>{left} · {right}</span>
        <span style={{ fontSize: small ? 18 : 24, fontWeight: 900, color: RED, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {(100 - pct).toFixed(1)}%
        </span>
      </div>
      <div style={{ height: small ? 7 : 10, background: `linear-gradient(90deg, #7a231d, ${RED})`, borderRadius: 6, overflow: "hidden", border: `1px solid ${LINE}` }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${GREEN}, #2b8f4c)`, boxShadow: `0 0 14px ${GREEN}`,
          transition: "width .7s cubic-bezier(.2,.9,.3,1)",
        }} />
      </div>
    </div>
  );
}

/**
 * Signed percentage, coloured.
 *
 * `forThem` inverts the colour, because the same number means the opposite
 * thing depending on whose list it is: a hero worth +6% to the enemy is the
 * worst news on the screen, and painting it green said the reverse.
 */
export function Delta({ v, size = 13, forThem }: { v: number; size?: number; forThem?: boolean }) {
  const good = forThem ? v < 0 : v >= 0;
  return (
    <span style={{
      fontSize: size, fontWeight: 900, fontVariantNumeric: "tabular-nums",
      color: good ? GREEN : RED, flexShrink: 0,
    }}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>
  );
}
