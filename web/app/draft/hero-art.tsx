"use client";

import { useEffect, useRef, useState } from "react";
import {
  ALLY_FILL, ENEMY_FILL, DANGER_FILL, CREAM, LINE, DIM, PANEL, PANEL_2, ON_FILL,
  R_CHIP, BW, lift, attrColor, attrFill, attrName, alpha,
} from "./ui";

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
  base, name, phase = 0, animate = true, position = "50% 12%", onReady, fit: fitMode = "cover",
  settleMs = 0,
}: {
  base: string; name?: string; phase?: number; animate?: boolean; position?: string;
  onReady?: (ready: boolean) => void;
  /** `contain` once the frame is gone, so a cut-out hero is never cropped. */
  fit?: "cover" | "contain";
  /**
   * Stop the render this long after it starts, leaving the last frame on screen.
   *
   * A paused `<video>` keeps painting its current frame, alpha included, so a
   * settled hero still looks cut out — it simply stops costing anything. Zero
   * means never settle, which is right for a single showcased hero and wrong
   * for ten of them at once. See the note in `HeroStanding`.
   */
  settleMs?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  const freed = useRef(false);
  const free = () => { if (!freed.current) { freed.current = true; release(); } };
  // The parent needs this to decide whether it may drop its frame: the render
  // is cut out, the still underneath is not. See `HeroStanding`.
  useEffect(() => { onReady?.(ready); }, [ready, onReady]);

  useEffect(() => {
    if (!ready || !settleMs) return;
    const t = setTimeout(() => {
      try { vid.current?.pause(); } catch { /* element already gone */ }
      setSettled(true);
    }, settleMs);
    return () => clearTimeout(t);
  }, [ready, settleMs]);

  useEffect(() => {
    setReady(false);
    // Reset alongside `ready` rather than in an effect of its own: a new hero in
    // this slot has not settled, and the two flags describe the same render.
    setSettled(false);
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
    objectFit: fitMode, objectPosition: position, display: "block",
  };

  return (
    <div style={{
      // The gentle float stops when the render does. A transform animation on
      // an element carrying a filter makes the browser re-run the filter every
      // frame, which is the opposite of settling.
      position: "absolute", inset: 0,
      animation: animate && !settled ? "dl-idle 5s ease-in-out infinite" : undefined,
      animationDelay: `${(phase * 0.5).toFixed(2)}s`,
    }}>
      <HeroImg base={base} name={name} position={position}
        style={{ ...fit, opacity: ready ? 0 : 1, transition: "opacity .5s ease" }} />
      {animate && src && (
        <video
          ref={vid}
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

/**
 * How long a drafted hero animates before it freezes on a frame.
 *
 * Long enough to see the hero arrive and breathe once — which is the only part
 * of a looping idle anybody actually watches — and short enough that a finished
 * board of ten is completely static. There is no quality lost: the frame it
 * stops on is the same render, alpha and all.
 */
const SETTLE_MS = 4200;

/**
 * A drafted hero, standing free on the page.
 *
 * Valve's renders are VP9-with-alpha — they are already cut out. The black box
 * behind every drafted hero was never theirs; it was our `--tile` bed, put there
 * for the still image underneath, which is an opaque JPEG. So once the render is
 * actually playing there is nothing to hide, and the frame comes off: the hero
 * stands on the paper with a hard ink drop-shadow, which is the same die-cut
 * sticker every other object on this page is.
 *
 * `drop-shadow` follows the alpha channel rather than the box, so the shadow is
 * hero-shaped. That is the whole trick, and it is why this cannot be done with
 * `box-shadow`.
 *
 * Until the render arrives — and permanently in any browser that will not decode
 * VP9 with alpha, which notably includes Safari — the framed still is shown
 * instead. That fallback is a deliberate design, not a broken state: a portrait
 * that fades to black at its edges needs a dark bed, or it haloes on cream.
 */
function HeroStanding({
  hero, fill, latest, phase, motion, h,
}: { hero: LineupHero; fill: string; latest: boolean; phase: number; motion: boolean; h: string }) {
  // `cut` needs to start false again for a new hero. The parent keys this
  // component on the hero id so React remounts it, which resets the state
  // without an effect that writes state during mount.
  const [cut, setCut] = useState(false);

  return (
    <div style={{ position: "relative", height: h, borderRadius: R_CHIP, boxSizing: "border-box" }}>
      <div
        className="dl-drop"
        style={{
          position: "absolute", inset: 0, borderRadius: R_CHIP, boxSizing: "border-box",
          overflow: cut ? "visible" : "hidden",
          background: cut ? "transparent" : "var(--tile)",
          border: cut ? "none" : `${BW}px solid ${LINE}`,
          boxShadow: cut ? "none" : `3px 3px 0 ${LINE}`,
          transition: "background .35s ease, border-color .35s ease",
        }}
      >
        {/*
         * Freed from the frame, the art gets its own box, and it is bigger than
         * the slot. Valve's renders are square; `contain` inside a slot that is
         * twice as tall as it is wide therefore scales the hero down to the
         * slot's WIDTH and centres it in all that leftover height, which is why
         * the first version looked like a row of postage stamps. Growing the box
         * past the slot on three sides and anchoring the image to its bottom
         * edge puts the hero at a readable size with its feet on the line.
         */}
        {/*
         * ONE drop-shadow, and the render settles.
         *
         * The first version of this stacked THREE drop-shadows to fake an ink
         * outline, and put them on a playing video. A filter on an animating
         * element is recomputed every frame, so that was three full-frame
         * filter passes per hero per frame, times ten heroes — which is exactly
         * why the board went from smooth to laggy the moment the tiles came
         * off. One offset pass costs a third of that.
         *
         * The rest is `settleMs`: each hero plays its idle for a few seconds as
         * it lands, which is the moment the animation is actually worth
         * anything, and then pauses on a frame. A paused video still paints
         * with its alpha intact, so the board ends up as ten static cut-outs
         * that cost nothing, instead of ten videos decoding forever behind a
         * filter.
         */}
        <div style={cut
          ? {
            position: "absolute", left: "-14%", right: "-14%", top: "-24%", bottom: "8%",
            // Hero-shaped, because `drop-shadow` follows the alpha channel
            // rather than the box. That is the whole trick.
            filter: `drop-shadow(2px 3px 0 ${LINE})`,
          }
          : { position: "absolute", inset: 0 }}>
          <HeroArt base={heroBase(hero.img)} name={hero.name} phase={phase} animate={motion}
            onReady={setCut} position={cut ? "50% 100%" : "50% 12%"} fit={cut ? "contain" : "cover"}
            settleMs={SETTLE_MS} />
        </div>

        {!cut && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 4px",
            background: "#16131F", textAlign: "center",
          }}>
            <span style={{
              fontSize: "clamp(7px, 2.3vw, 10px)", color: "#FFF7EA", textTransform: "uppercase", fontWeight: 900,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", letterSpacing: .4,
            }}>{hero.name}</span>
          </div>
        )}

        {latest && (
          <>
            <span key={`f${hero.id}`} className="dl-flash" style={{
              position: "absolute", inset: 0, pointerEvents: "none", background: fill,
              borderRadius: R_CHIP, mixBlendMode: cut ? "multiply" : "normal",
            }} />
            <span key={`r${hero.id}`} style={{
              position: "absolute", inset: -3, pointerEvents: "none", borderRadius: R_CHIP,
              border: `3px solid ${fill}`, animation: "dl-ring .6s var(--ease) both",
            }} />
          </>
        )}
      </div>

      {/* Standing on the page, the name needs its own object — there is no card
          edge left to hang a bar off. */}
      {/*
       * Pinned to the slot's own edges rather than centred on it. A pill centred
       * with translateX and allowed to be wider than its slot runs straight into
       * the neighbouring hero's pill — at five slots across a 390px phone there
       * is no spare width, so "Witch Doctor" and "Night Stalker" printed over
       * each other. Inside the slot it can only ever ellipsise.
       */}
      {cut && (
        <span className="dl-stk flat" style={{
          position: "absolute", left: 0, right: 0, bottom: -7, justifyContent: "center",
          background: fill, fontSize: 7.5, padding: "2px 5px", borderWidth: 2,
          boxShadow: `2px 2px 0 ${LINE}`,
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hero.name}</span>
        </span>
      )}
    </div>
  );
}

/**
 * A hero in a slot, as a card off the sticker sheet.
 *
 * Ink outline, hard offset shadow, rounded corner — the same object the landing
 * page builds its game cards from. The art keeps its dark bed (`--tile`) in both
 * sheets because every Valve portrait fades to black at the edges and a cream
 * bed shows as a halo around each one.
 *
 * The name sits on a solid ink bar rather than the gradient scrim it used to
 * wear. A scrim fading into cream is a smudge; a bar is the same object the
 * landing page's ticker is, and it works over a dark portrait and a paper page
 * alike. The two hexes in here are deliberately literal: that bar is ink with
 * paper on it in BOTH sheets, so it must not follow `--stroke` when night
 * inverts it.
 */
function Card({
  hero, fill, latest, phase, motion, hidden, h, slot,
}: { hero?: LineupHero; fill: string; latest: boolean; phase: number; motion: boolean; hidden?: boolean; h: string; slot: number }) {
  // A drafted hero stands free; an empty slot and a hidden one stay framed,
  // because both of those ARE the frame — there is nothing cut out to show.
  if (hero && !hidden) {
    return (
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <HeroStanding key={hero.id} hero={hero} fill={fill} latest={latest} phase={phase} motion={motion} h={h} />
      </div>
    );
  }

  // Empty, or hidden during a blind pick. Both are the frame itself: a dashed
  // slot numbered the way the client numbers them, and a hatched card.
  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div style={{
        position: "relative", height: h, borderRadius: R_CHIP, overflow: "hidden", boxSizing: "border-box",
        background: hero ? "var(--tile)" : PANEL_2,
        border: `${BW}px ${hero ? "solid" : "dashed"} ${LINE}`,
        boxShadow: hero ? `3px 3px 0 ${LINE}` : "none",
      }}>
        {hero ? (
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            background: `repeating-linear-gradient(135deg, ${alpha(LINE, 14)} 0 7px, transparent 7px 14px)`,
            color: CREAM, fontSize: 22, fontWeight: 900,
          }}>?</div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: DIM, fontSize: 15, fontWeight: 900 }}>
            {slot}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A status sticker — PICKING…, BANNING…, READY — with a blinking dot when
 * `active`. This is what turns an opponent from a label into a presence: the
 * point is not the text, it is that something on their side of the board is
 * visibly alive while you are deciding.
 */
export function Presence({ text, fill, active }: { text: string; fill: string; active?: boolean }) {
  return (
    <span className="dl-stk flat" style={{
      background: fill, fontSize: 8, padding: "2px 7px", gap: 4, boxShadow: `2px 2px 0 ${LINE}`,
      borderWidth: 2, flexShrink: 0,
    }}>
      <span className={active ? "dl-turn" : undefined} style={{ width: 5, height: 5, borderRadius: 3, background: ON_FILL }} />
      {text.toUpperCase()}
    </span>
  );
}

/** One side of the board: a labelled row of five cards under a side sticker. */
export function TeamRow({
  side, heroes, latest, label, note, status, hidden, motion = true, height = "clamp(84px, 24vw, 124px)",
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
  const fill = side === "them" ? ENEMY_FILL : ALLY_FILL;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span className="dl-stk" style={{
          background: fill, fontSize: 9, padding: "3px 9px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}`,
          minWidth: 0, maxWidth: "56%",
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </span>
        {status && <Presence text={status.text} fill={fill} active={status.active} />}
        <span className="dl-rule" style={{ flex: "1 1 auto" }} />
        {/* Sat on the paper, not on the rule it would otherwise cross. */}
        {note && <span style={{ background: "var(--paper)", padding: "0 3px", flexShrink: 0 }}>{note}</span>}
      </div>
      {/* The bottom padding is the name sticker's room: a standing hero hangs
          its label below the slot, where a framed card carried it inside. */}
      <div style={{ display: "flex", gap: 6, paddingBottom: 11 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} hero={heroes[i]} fill={fill} h={height} slot={i + 1}
            latest={heroes[i] != null && heroes[i].id === latest}
            phase={i} motion={motion} hidden={hidden} />
        ))}
      </div>
    </div>
  );
}

/**
 * Square hero tiles. The one grid used by every screen that picks heroes.
 *
 * `dim` is the ban phase: the whole pool goes desaturated under a pink wash, so
 * the mode you are in is legible from the grid itself rather than only from the
 * banner above it — you are about to remove a hero, not take one.
 */
export function HeroGrid({
  ids, byId, onPick, dim, min = "clamp(46px, 13.5vw, 60px)", labelSize,
}: {
  ids: number[];
  byId: (id: number) => { img: string; name: string } | undefined;
  onPick: (id: number) => void;
  dim?: boolean;
  min?: string;
  labelSize?: number;
}) {
  return (
    // The gap is wider than it was: every tile now throws a 2px hard shadow, and
    // at the old 5px they landed on top of each other.
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`, gap: 7 }}>
      {ids.map((id) => {
        const h = byId(id);
        if (!h) return null;
        return (
          <button key={id} className="dl-pick" onClick={() => onPick(id)} title={h.name} style={{
            padding: 0, border: `${BW}px solid ${LINE}`, borderRadius: R_CHIP, overflow: "hidden", boxSizing: "border-box",
            background: "var(--tile)", cursor: "pointer", position: "relative", aspectRatio: "1 / 1",
            filter: dim ? "saturate(.4) brightness(.85)" : undefined, ...lift(2),
          }}>
            <HeroImg base={heroBase(h.img)} name={h.name} />
            {dim && <span style={{ position: "absolute", inset: 0, background: alpha(DANGER_FILL, 34), pointerEvents: "none" }} />}
            <span style={{
              position: "absolute", left: 0, right: 0, bottom: 0, fontSize: labelSize ?? 7.5,
              color: "#FFF7EA", background: "#16131F", padding: "2px 3px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 900, letterSpacing: .2,
            }}>{h.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The heroes taken off the board, stamped out. */
export function BanStrip({ bans, byId }: { bans: { by: "bot" | "you"; heroId: number }[]; byId: (id: number) => { img: string; name: string } | undefined }) {
  if (!bans.length) return null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
      <span className="dl-stk" style={{ background: DANGER_FILL, fontSize: 8, padding: "2px 8px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}`, marginRight: 2 }}>BANNED</span>
      {bans.map((b, i) => {
        const h = byId(b.heroId);
        if (!h) return null;
        return (
          <div key={i} title={`${h.name} — banned by ${b.by === "you" ? "you" : "them"}`}
            style={{
              position: "relative", width: 30, height: 20, borderRadius: 5, overflow: "hidden",
              border: `2px solid ${LINE}`, boxSizing: "border-box", background: "var(--tile)",
            }}>
            <HeroImg base={heroBase(h.img)} shape="crop" position="50% 22%" style={{ filter: "grayscale(1) brightness(.5)" }} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: b.by === "you" ? ALLY_FILL : ENEMY_FILL, fontSize: 14, fontWeight: 900 }}>×</div>
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated The design system now lives in theme.tsx and is rendered by Shell. */
export function DraftStyles() { return null; }

/* ------------------------------------------------- the Dota draft board */

/**
 * One side's five slots, stacked vertically, flanking the pool.
 *
 * This is the shape Dota's own draft takes: Radiant down the left, Dire down the
 * right, the hero grid between them. The rows-above-a-grid layout this replaced
 * was readable but generic — the vertical columns are most of what makes a
 * drafting screen recognisable at a glance.
 *
 * The columns stay deliberately narrow. They are status, not the interaction;
 * every pixel they take comes out of the pool, which is the thing being used.
 */
export function DraftColumn({
  side, label, heroes, latest, active, status, motion = true, width = 58,
}: {
  side: "radiant" | "dire";
  label: string;
  heroes: LineupHero[];
  latest: number | null;
  active?: boolean;
  status?: string;
  motion?: boolean;
  width?: number;
}) {
  const fill = side === "radiant" ? ALLY_FILL : ENEMY_FILL;
  return (
    // Sticky, because a team column that scrolls away defeats the point of
    // flanking the pool with it — in the client both sides are always on screen.
    <div style={{
      width, flexShrink: 0, display: "flex", flexDirection: "column", gap: 5,
      position: "sticky", top: 0, alignSelf: "flex-start", zIndex: 2,
    }}>
      <div className={active ? "dl-turn" : undefined} style={{
        textAlign: "center", padding: "4px 3px 5px", borderRadius: 9, boxSizing: "border-box",
        background: active ? fill : PANEL, border: `2px solid ${LINE}`, boxShadow: `2px 2px 0 ${LINE}`,
      }}>
        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: .6, color: active ? ON_FILL : CREAM, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        {status && (
          <div style={{ fontSize: 7, color: active ? ON_FILL : DIM, fontWeight: 800, letterSpacing: .3 }}>
            {status}
          </div>
        )}
      </div>

      {Array.from({ length: 5 }).map((_, i) => {
        const hero = heroes[i];
        const isLatest = hero != null && hero.id === latest;
        return (
          <div
            key={hero?.id ?? `e${i}`}
            className={hero ? "dl-drop" : undefined}
            style={{
              position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden",
              borderRadius: 9, boxSizing: "border-box",
              background: hero ? "var(--tile)" : PANEL_2,
              border: `2px ${hero ? "solid" : "dashed"} ${LINE}`,
              boxShadow: hero ? `2px 2px 0 ${LINE}` : "none",
            }}
          >
            {hero ? (
              <>
                <HeroArt base={heroBase(hero.img)} name={hero.name} phase={i} animate={motion} />
                <span style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 6.5, color: "#FFF7EA",
                  fontWeight: 900, letterSpacing: .2, textAlign: "center", background: "#16131F", padding: "1px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{hero.name}</span>
                {isLatest && (
                  <>
                    <span className="dl-flash" style={{ position: "absolute", inset: 0, background: fill }} />
                    <span style={{ position: "absolute", inset: -2, border: `2.5px solid ${fill}`, borderRadius: "inherit", animation: "dl-ring .6s var(--ease) both" }} />
                  </>
                )}
              </>
            ) : (
              <span style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
                color: DIM, fontSize: 13, fontWeight: 900,
              }}>{i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The hero pool, grouped by primary attribute.
 *
 * Dota's grid is organised by attribute and players navigate it that way — "I
 * need a strength offlaner" is a section, not a search. Every group is headed by
 * a sticker in that attribute's pastel, and every tile carries the attribute
 * colour down its left edge, which is how the client marks them too.
 */
export function AttributePool({
  ids, byId, onPick, dim, min = "clamp(42px, 12vw, 54px)",
}: {
  ids: number[];
  byId: (id: number) => { img: string; name: string; attr: string } | undefined;
  onPick: (id: number) => void;
  dim?: boolean;
  min?: string;
}) {
  const order: string[] = ["str", "agi", "int", "all"];
  const groups = order
    .map((a) => ({ attr: a, list: ids.filter((id) => byId(id)?.attr === a) }))
    .filter((g) => g.list.length > 0);

  return (
    <div style={{ display: "grid", gap: 11 }}>
      {groups.map((g) => {
        const c = attrColor(g.attr);
        const f = attrFill(g.attr);
        return (
          <div key={g.attr}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <span className="dl-stk" style={{ background: f, fontSize: 8, padding: "2px 8px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}` }}>
                {attrName(g.attr)}
              </span>
              <span className="dl-rule" style={{ flex: "1 1 auto" }} />
              <span style={{ fontSize: 8.5, color: DIM, fontWeight: 900 }}>{g.list.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`, gap: 6 }}>
              {g.list.map((id) => {
                const h = byId(id)!;
                return (
                  <button key={id} className="dl-pick" onClick={() => onPick(id)} title={h.name} style={{
                    padding: 0, position: "relative", aspectRatio: "1 / 1", cursor: "pointer", overflow: "hidden",
                    background: "var(--tile)", border: `2px solid ${LINE}`, borderLeftWidth: 4,
                    borderLeftColor: dim ? DANGER_FILL : c, borderRadius: 9, boxSizing: "border-box",
                    filter: dim ? "saturate(.4) brightness(.85)" : undefined, ...lift(2),
                  }}>
                    <HeroImg base={heroBase(h.img)} name={h.name} />
                    {dim && <span style={{ position: "absolute", inset: 0, background: alpha(DANGER_FILL, 34), pointerEvents: "none" }} />}
                    <span style={{
                      position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 6.5, color: "#FFF7EA", fontWeight: 900,
                      background: "#16131F", padding: "1px 2px",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{h.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
