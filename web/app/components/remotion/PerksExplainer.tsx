"use client";

/**
 * "Why play with IEsports?" — the second film, beside the main explainer on
 * desktop where a lone 4:5 frame leaves dead space either side.
 *
 * The main film answers "how does this work". This answers "why here and not a
 * scrim with friends", which is the harder question. Three answers, in the
 * order they matter to someone weighing ₹500: your matches get an audience,
 * your best round comes back as something you can post, and you leave knowing
 * more about your own play than when you arrived.
 *
 * IMAGERY. The thumbnails are real photographs from IEsports events already
 * shipping on the site, not stock or generated art. Actual Indian players
 * holding an actual trophy is more persuasive than anything a stock library
 * has, and it avoids putting someone else's copyrighted screenshots into a
 * film that promotes a paid tournament.
 *
 * 600 frames @ 30fps — 20s.
 */

import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

export type PerksProps = { game?: GameKey; entryFee?: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.33, 1, 0.68, 1);

const beat = (frame: number, a: number, b: number, r = 12) => {
  const enter = interpolate(frame, [a, a + r], [0, 1], { ...clamp, easing: EASE });
  const exit = interpolate(frame, [b - r, b], [0, 1], { ...clamp, easing: EASE });
  return { opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 28 - exit * 28}px)` };
};

const CHAT = [
  { u: "riz.", t: "that clutch omg" },
  { u: "sneh", t: "1v3?? no way" },
  { u: "kabir", t: "team B carrying fr" },
];

/**
 * Real IEsports event photography. The captions describe the MOMENT rather than
 * a specific mechanical play — a "1v3 CLUTCH" label over a posed trophy shot
 * reads as a mismatch, and these images are what we actually have.
 *
 * Swap `src` for gameplay grabs once there are some; nothing else changes.
 */
const SHORTS = [
  { src: "ascension-champions.jpg", label: "GRAND FINAL", views: "12.4K" },
  { src: "cs2-royal-champions.jpg", label: "MATCH POINT", views: "8.1K" },
  { src: "cs2-royal-runnerup.jpg", label: "CHAMPIONS", views: "5.7K" },
];

/** What a post-tournament report actually tells you. */
const INSIGHTS = [
  { k: "First bloods", v: "34%", note: "top 20% of the lobby", good: true },
  { k: "Post-plant retakes", v: "2 / 9", note: "you lose these", good: false },
  { k: "Opening duels · B site", v: "71%", note: "your strongest angle", good: true },
];

export const PerksExplainer: React.FC<PerksProps> = ({ game = "valorant", entryFee = 500 }) => {
  const frame = useCurrentFrame();
  const T = GAME_THEME[game];
  const drift = Math.sin(frame / 80) * 4;

  const bIntro = beat(frame, -8, 88, 12);
  const bLive = beat(frame, 82, 252, 13);
  const bShorts = beat(frame, 246, 412, 13);
  const bAI = beat(frame, 406, 552, 13);
  const bEnd = beat(frame, 546, 610, 11);

  const viewers = Math.round(interpolate(frame, [110, 230], [0, 1240], { ...clamp, easing: EASE }));

  const eyebrow = (n: string) => (
    <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>{n}</div>
  );
  const headline: React.CSSProperties = { fontSize: 39, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1 };

  return (
    <AbsoluteFill style={{ background: "#050506", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 50% at 50% ${10 + drift}%, ${T.soft}, transparent 65%)` }} />

      <div style={{ position: "absolute", top: 42, left: 58, right: 58, display: "flex", justifyContent: "space-between", zIndex: 5 }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".2em", color: "#5a5a5a" }}>IESPORTS</span>
        <span style={{ fontSize: 17, color: T.acc, letterSpacing: ".14em", fontWeight: 700 }}>INCLUDED</span>
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 58, right: 58, zIndex: 5 }}>
        <div style={{ height: 3, background: "#161616", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(frame / 600) * 100}%`, background: T.acc, boxShadow: `0 0 14px ${T.glow}` }} />
        </div>
      </div>

      {/* ── intro ── */}
      <AbsoluteFill style={{ padding: "150px 58px 186px", justifyContent: "center", gap: 18, ...bIntro }}>
        {eyebrow(`YOUR ₹${entryFee} BUYS MORE THAN A LOBBY`)}
        <div style={{ fontSize: 52, fontWeight: 800, color: "#fff", letterSpacing: "-.03em", lineHeight: 1.06 }}>
          Why play with<br /><span style={{ color: T.acc }}>IEsports?</span>
        </div>
        <div style={{ fontSize: 20, color: "#8d8d8d", lineHeight: 1.55 }}>
          Three things you don&apos;t get from a scrim with friends.
        </div>
      </AbsoluteFill>

      {/* ── perk 01 · live ── */}
      <AbsoluteFill style={{ padding: "140px 52px 180px", justifyContent: "center", gap: 15, ...bLive }}>
        {eyebrow("PERK 01")}
        <div style={headline}>Every match,<br />streamed live</div>

        <div style={{
          borderRadius: 16, overflow: "hidden", border: "1px solid #1c1e21", background: "#0b0c0e",
          transform: `scale(${interpolate(frame, [96, 118], [0.95, 1], { ...clamp, easing: EASE })})`,
        }}>
          <div style={{ position: "relative", height: 228 }}>
            <Img src={staticFile("valorantimg3.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.72 }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,5,6,.35), rgba(5,5,6,.75))" }} />
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 74, height: 52, borderRadius: 13, background: "#ff0033",
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 34px rgba(255,0,51,.45)",
            }}>
              <div style={{ width: 0, height: 0, borderLeft: "18px solid #fff", borderTop: "11px solid transparent", borderBottom: "11px solid transparent", marginLeft: 4 }} />
            </div>
            <div style={{
              position: "absolute", top: 13, left: 13, display: "flex", alignItems: "center", gap: 7,
              background: "rgba(10,10,12,.72)", border: "1px solid rgba(255,0,51,.55)", borderRadius: 100, padding: "6px 13px",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff0033", opacity: 0.55 + Math.sin(frame / 5) * 0.45 }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#ff5c7a", letterSpacing: ".08em" }}>LIVE</span>
            </div>
            <div style={{ position: "absolute", top: 15, right: 15, fontSize: 15, color: "#e4e4e4", fontWeight: 700, textShadow: "0 1px 6px rgba(0,0,0,.9)" }}>
              {viewers.toLocaleString("en-IN")} watching
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(255,255,255,.12)" }}>
              <div style={{ height: "100%", width: `${interpolate(frame, [96, 240], [8, 84], clamp)}%`, background: "#ff0033" }} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CHAT.map((c, i) => {
            const at = 142 + i * 18;
            const a = interpolate(frame, [at, at + 10], [0, 1], clamp);
            return (
              <div key={c.u} style={{ display: "flex", gap: 9, fontSize: 16, opacity: a, transform: `translateX(${(1 - a) * -10}px)` }}>
                <span style={{ color: T.acc, fontWeight: 700 }}>{c.u}</span>
                <span style={{ color: "#8d8d8d" }}>{c.t}</span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 17, color: "#8d8d8d", opacity: interpolate(frame, [214, 230], [0, 1], clamp) }}>
          Your friends can watch you play. So can everyone else.
        </div>
      </AbsoluteFill>

      {/* ── perk 02 · shorts ── */}
      <AbsoluteFill style={{ padding: "140px 52px 180px", justifyContent: "center", gap: 15, ...bShorts }}>
        {eyebrow("PERK 02")}
        <div style={headline}>Your best plays,<br />cut into shorts</div>
        <div style={{ fontSize: 18, color: "#8d8d8d", lineHeight: 1.5 }}>
          Edited by us, sent to you. Post them wherever you like.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          {SHORTS.map((s, i) => {
            const at = 292 + i * 16;
            const a = interpolate(frame, [at, at + 16], [0, 1], { ...clamp, easing: EASE });
            return (
              <div key={s.label} style={{
                flex: 1, borderRadius: 14, overflow: "hidden",
                border: `1px solid ${i === 0 ? T.line : "#1c1e21"}`, background: "#0f1113",
                opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${0.94 + a * 0.06})`,
              }}>
                <div style={{ position: "relative", height: 200 }}>
                  <Img src={staticFile(s.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,5,6,.15), rgba(5,5,6,.82))" }} />
                  <div style={{
                    position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)",
                    width: 0, height: 0, borderLeft: "16px solid rgba(255,255,255,.94)",
                    borderTop: "11px solid transparent", borderBottom: "11px solid transparent",
                    filter: "drop-shadow(0 2px 8px rgba(0,0,0,.8))",
                  }} />
                  <div style={{ position: "absolute", left: 9, bottom: 8, fontSize: 12, color: "#eaeaea", fontWeight: 700, textShadow: "0 1px 5px rgba(0,0,0,.9)" }}>
                    ▶ {s.views}
                  </div>
                </div>
                <div style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, letterSpacing: ".04em", color: i === 0 ? T.acc : "#9a9a9a" }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* ── perk 03 · AI insights ── */}
      <AbsoluteFill style={{ padding: "140px 52px 180px", justifyContent: "center", gap: 15, ...bAI }}>
        {eyebrow("PERK 03")}
        <div style={headline}>AI breaks down<br />your game</div>
        <div style={{ fontSize: 18, color: "#8d8d8d", lineHeight: 1.5 }}>
          Every round you played, read back to you — what worked, what cost you.
        </div>

        <div style={{
          background: "#0f1113", border: "1px solid #1c1e21", borderRadius: 16, padding: 17, marginTop: 4,
          transform: `scale(${interpolate(frame, [420, 440], [0.96, 1], { ...clamp, easing: EASE })})`,
        }}>
          {INSIGHTS.map((r, i) => {
            const at = 442 + i * 18;
            const a = interpolate(frame, [at, at + 13], [0, 1], { ...clamp, easing: EASE });
            return (
              <div key={r.k} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 0",
                borderTop: i ? "1px solid #191b1e" : "none",
                opacity: a, transform: `translateX(${(1 - a) * -12}px)`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, color: "#fff", fontWeight: 700 }}>{r.k}</div>
                  <div style={{ fontSize: 13, color: r.good ? "#6fcf8a" : "#e0a06a", marginTop: 2 }}>{r.note}</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: r.good ? "#6fcf8a" : "#e0a06a" }}>{r.v}</div>
              </div>
            );
          })}
        </div>

        <div style={{
          display: "flex", gap: 11, alignItems: "flex-start", padding: "13px 15px", borderRadius: 13,
          background: T.soft, border: `1px solid ${T.line}`,
          opacity: interpolate(frame, [502, 518], [0, 1], { ...clamp, easing: EASE }),
        }}>
          <span style={{ fontSize: 19 }}>✦</span>
          <div style={{ fontSize: 15.5, color: "#d6d6d6", lineHeight: 1.5 }}>
            <b style={{ color: "#fff" }}>Next time:</b> hold your post-plant angle 3s longer. You&apos;re
            peeking into retakes you don&apos;t need to take.
          </div>
        </div>
      </AbsoluteFill>

      {/* ── close ── */}
      <AbsoluteFill style={{ padding: "150px 58px 186px", justifyContent: "center", alignItems: "center", gap: 15, textAlign: "center", ...bEnd }}>
        <div style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.12 }}>
          Get watched.<br />Get the clips.<br /><span style={{ color: T.acc }}>Get better.</span>
        </div>
        <div style={{ fontSize: 19, color: "#8d8d8d" }}>All of it included in your entry.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default PerksExplainer;
