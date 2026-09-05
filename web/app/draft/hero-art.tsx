"use client";

import { useEffect, useRef, useState } from "react";
import { RED, GREEN, CREAM, LINE, MUTED, GOLD } from "./ui";

/**
 * Hero art — one place, one fallback chain.
 *
 * Every hero image in the app goes through `HeroImg`. That is the point: the
 * broken pictures came from call sites each deriving their own URL and having no
 * answer when it 404'd. Here the chain is fixed and proven — the standing
 * portrait exists for 123 of 127 heroes, the landscape crop and the square icon
 * exist for all 127 — so a miss always lands on something that renders.
 *
 * NOTHING IS EVER SCALED WITH `transform`. An earlier version zoomed the render
 * with `transform: scale(1.5); transform-origin: 50% 34%`, which scales outward
 * from above centre and pushed heads out of the top of the frame — the reported
 * "cut off at the top". With plain `object-fit: cover` on a square or portrait
 * source in a taller-than-wide slot the scale is driven by height, so the crop is
 * horizontal only and the hero can never lose its head.
 */

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2";

/** `img` here is OpenDota's path; the basename is Valve's internal hero name. */
export const heroBase = (img: string) => img.split("/").pop()!.replace(/\.png.*$/, "").replace(/\?.*$/, "");

export const heroPortrait = (base: string) => `${CDN}/images/heroes/${base}_vert.jpg`;
export const heroCrop = (base: string) => `${CDN}/images/dota_react/heroes/crops/${base}.png`;
export const heroIcon = (base: string) => `${CDN}/images/dota_react/heroes/icons/${base}.png`;
export const heroRender = (base: string) => `${CDN}/videos/dota_react/heroes/renders/${base}.webm`;

type Shape = "portrait" | "crop" | "icon";

/**
 * A hero picture that cannot end up blank.
 *
 * `shape` is only the preferred source. Portrait is a 235x272 standing shot and
 * suits a tall slot; crop is 400x250 and suits a wide one. On error it walks down
 * to the crop and then the icon, both of which exist for every hero.
 */
export function HeroImg({
  base, name, shape = "portrait", style, position = "50% 14%",
}: { base: string; name?: string; shape?: Shape; style?: React.CSSProperties; position?: string }) {
  const chain = shape === "portrait"
    ? [heroPortrait(base), heroCrop(base), heroIcon(base)]
    : shape === "crop"
      ? [heroCrop(base), heroIcon(base)]
      : [heroIcon(base)];
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [base, shape]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={chain[Math.min(step, chain.length - 1)]}
      alt={name ?? ""}
      loading="lazy"
      onError={() => setStep((s) => (s < chain.length - 1 ? s + 1 : s))}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: position, display: "block", ...style }}
    />
  );
}

/**
 * A picture that upgrades itself into Valve's animated 3D render.
 *
 * The render is VP9-with-alpha, square, and 1.3-8.7 MB, so it is progressive
 * enhancement layered over the still and never a dependency: if it stalls or the
 * browser refuses it, the still is already on screen and stays.
 *
 * The still underneath is the portrait (0.86 aspect), not the crop (1.60) — a
 * crossfade between the crop's landscape framing and the render's square framing
 * made heroes visibly jump and resize, which is what read as a "glitch".
 */
const gate = { active: 0, max: 2, waiting: [] as (() => void)[] };
export function setRenderConcurrency(n: number) { gate.max = Math.max(1, n); }
function acquire(run: () => void) {
  if (gate.active < gate.max) { gate.active++; run(); return; }
  gate.waiting.push(run);
}
function release() {
  const next = gate.waiting.pop();
  if (next) next(); else gate.active = Math.max(0, gate.active - 1);
}

export function HeroArt({
  base, name, phase = 0, animate = true, position = "50% 12%",
}: { base: string; name?: string; phase?: number; animate?: boolean; position?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const freed = useRef(false);
  const free = () => { if (!freed.current) { freed.current = true; release(); } };

  useEffect(() => {
    setReady(false);
    if (!animate) return;
    let cancelled = false;
    freed.current = false;
    acquire(() => { if (!cancelled) setSrc(heroRender(base)); });
    const bail = setTimeout(() => { if (!cancelled) free(); }, 12000);
    return () => { cancelled = true; clearTimeout(bail); free(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, base]);

  // Identical fit on both layers, so the crossfade cannot shift the framing.
  const fit: React.CSSProperties = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    objectFit: "cover", objectPosition: position, display: "block",
  };

  return (
    <div style={{
      position: "absolute", inset: 0,
      animation: animate ? "dl-idle 5s ease-in-out infinite" : undefined,
      animationDelay: `${(phase * 0.5).toFixed(2)}s`,
    }}>
      <HeroImg base={base} name={name} position={position}
        style={{ ...fit, opacity: ready ? 0 : 1, transition: "opacity .5s ease" }} />
      {animate && src && (
        <video
          src={src} autoPlay loop muted playsInline preload="auto"
          onCanPlay={() => { setReady(true); free(); }}
          onError={() => free()}
          style={{ ...fit, opacity: ready ? 1 : 0, transition: "opacity .5s ease" }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the board */

export type LineupHero = { id: number; img: string; name: string };

function Card({
  hero, accent, latest, phase, motion, hidden, h,
}: { hero?: LineupHero; accent: string; latest: boolean; phase: number; motion: boolean; hidden?: boolean; h: string }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div style={{
        position: "relative", height: h, borderRadius: 5, overflow: "hidden",
        background: hero ? "#0c0a12" : "rgba(255,255,255,.02)",
        border: `1px solid ${latest ? accent : hero ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.05)"}`,
        boxShadow: latest ? `0 0 0 1px ${accent}, 0 6px 20px -8px ${accent}` : "none",
        animation: latest ? "dl-slam .45s cubic-bezier(.2,.9,.3,1.3)" : undefined,
      }}>
        {hero && !hidden && <HeroArt base={heroBase(hero.img)} name={hero.name} phase={phase} animate={motion} />}

        {hero && hidden && (
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            background: "repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 7px, transparent 7px 14px)",
            color: MUTED, fontSize: 22, fontWeight: 900,
          }}>?</div>
        )}

        {!hero && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "rgba(255,255,255,.1)", fontSize: 16 }}>◆</div>
        )}

        {hero && !hidden && (
          <>
            <div style={{
              position: "absolute", left: 0, right: 0, bottom: 0, height: "46%",
              background: "linear-gradient(transparent, rgba(4,3,7,.94))", pointerEvents: "none",
            }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 2px 3px", textAlign: "center" }}>
              <span style={{
                fontSize: "clamp(6.5px, 2.1vw, 9px)", color: CREAM, textTransform: "uppercase", fontWeight: 800,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block",
                textShadow: "0 1px 4px #000",
              }}>{hero.name}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A status pill — "PICKING…", "BANNING…", "READY" — with a pulsing dot when
 * `active`. This is what turns an opponent from a label into a presence: the
 * point isn't the text, it's that something on their side of the board is
 * visibly alive while you're deciding.
 */
export function Presence({ text, color, active }: { text: string; color: string; active?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8.5, fontWeight: 900, letterSpacing: .5, color, flexShrink: 0 }}>
      <span className={active ? "dl-turn" : undefined} style={{ width: 5, height: 5, borderRadius: 3, background: color, boxShadow: `0 0 6px ${color}` }} />
      {text.toUpperCase()}
    </span>
  );
}

/** One side of the board: a labelled row of five cards. */
export function TeamRow({
  side, heroes, latest, label, note, status, hidden, motion = true, height = "clamp(72px, 20vw, 112px)",
}: {
  side: "them" | "you";
  heroes: LineupHero[];
  latest: number | null;
  label: string;
  note?: React.ReactNode;
  status?: { text: string; active?: boolean };
  hidden?: boolean;
  motion?: boolean;
  height?: string;
}) {
  const accent = side === "them" ? RED : GREEN;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 9, letterSpacing: 1.3, fontWeight: 900, color: accent, display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: accent, boxShadow: `0 0 8px ${accent}`, flexShrink: 0 }} />
          {label}
        </span>
        {status && <Presence text={status.text} color={accent} active={status.active} />}
        <span style={{ flex: "1 1 auto", height: 1, background: `linear-gradient(90deg, ${accent}44, transparent)` }} />
        {note}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} hero={heroes[i]} accent={accent} h={height}
            latest={heroes[i] != null && heroes[i].id === latest}
            phase={i} motion={motion} hidden={hidden} />
        ))}
      </div>
    </div>
  );
}

/** Square hero tiles. The one grid used by every screen that picks heroes. */
export function HeroGrid({
  ids, byId, onPick, dim, min = "clamp(58px, 17vw, 76px)", labelSize,
}: {
  ids: number[];
  byId: (id: number) => { img: string; name: string } | undefined;
  onPick: (id: number) => void;
  dim?: boolean;
  min?: string;
  labelSize?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`, gap: 5 }}>
      {ids.map((id) => {
        const h = byId(id);
        if (!h) return null;
        return (
          <button key={id} className="dl-pick" onClick={() => onPick(id)} title={h.name} style={{
            padding: 0, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden",
            background: "#0c0a12", cursor: "pointer", position: "relative", aspectRatio: "1 / 1",
            filter: dim ? "saturate(.4)" : undefined,
          }}>
            <HeroImg base={heroBase(h.img)} name={h.name} />
            <span style={{
              position: "absolute", left: 0, right: 0, bottom: 0, fontSize: labelSize ?? 7.5, color: CREAM,
              background: "linear-gradient(transparent, rgba(0,0,0,.95))", padding: "10px 3px 3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 800,
            }}>{h.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BanStrip({ bans, byId }: { bans: { by: "bot" | "you"; heroId: number }[]; byId: (id: number) => { img: string; name: string } | undefined }) {
  if (!bans.length) return null;
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 8.5, letterSpacing: 1.3, color: MUTED, fontWeight: 800, marginRight: 2 }}>BANNED</span>
      {bans.map((b, i) => {
        const h = byId(b.heroId);
        if (!h) return null;
        return (
          <div key={i} title={`${h.name} — banned by ${b.by === "you" ? "you" : "them"}`}
            style={{ position: "relative", width: 26, height: 16, borderRadius: 3, overflow: "hidden" }}>
            <HeroImg base={heroBase(h.img)} shape="crop" position="50% 22%" style={{ filter: "grayscale(1) brightness(.38)" }} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: b.by === "you" ? GREEN : RED, fontSize: 12, fontWeight: 900 }}>×</div>
          </div>
        );
      })}
    </div>
  );
}

export function DraftStyles() {
  return (
    <style>{`
      html, body { background: #07060a; overscroll-behavior: none; }
      @keyframes dl-idle { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes dl-slam { 0% { opacity:0; transform: scale(.86) translateY(10px) } 60% { transform: scale(1.03) } 100% { opacity:1; transform:none } }
      @keyframes dl-pulse { 0%,100% { opacity:.45 } 50% { opacity:1 } }
      @keyframes dl-in { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }
      @keyframes dl-sheen { from { background-position: -220% 0 } to { background-position: 320% 0 } }
      @keyframes dl-lock { 0% { opacity:0; transform: translateY(-6px) scale(.92) } 12% { opacity:1; transform: translateY(0) scale(1.04) } 20% { transform: translateY(0) scale(1) } 82% { opacity:1 } 100% { opacity:0; transform: translateY(-4px) scale(.97) } }
      .dl-turn { animation: dl-pulse 1.3s ease-in-out infinite; }
      .dl-in { animation: dl-in .3s ease-out both; }
      .dl-lock { animation: dl-lock 1.1s cubic-bezier(.2,.9,.3,1) both; }
      .dl-btn { transition: transform .07s, filter .15s; -webkit-tap-highlight-color: transparent; }
      .dl-btn:active:not(:disabled) { transform: scale(.96); filter: brightness(1.1); }
      .dl-pick { transition: transform .07s, border-color .12s; -webkit-tap-highlight-color: transparent; }
      .dl-pick:active { transform: scale(.9); border-color: ${GOLD} !important; }
      @media (hover: hover) { .dl-pick:hover { border-color: ${GOLD} !important; } }
      .dl-sheen { background: linear-gradient(100deg, transparent 38%, rgba(255,255,255,.16) 50%, transparent 62%); background-size: 220% 100%; animation: dl-sheen 2.6s linear infinite; }
      ::-webkit-scrollbar { width: 0; height: 0; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
    `}</style>
  );
}
