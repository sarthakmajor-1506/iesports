"use client";

/**
 * "What else you get" — the second film, played beside the main explainer on
 * desktop where there is otherwise dead space either side of a 4:5 frame.
 *
 * The main film answers "how does this work". This one answers "why this and
 * not a scrim with friends", which is a different and harder question. Both
 * perks here are about being *seen*: your matches go out live, and your best
 * round comes back to you as something you can post. For a ₹500 entry that is
 * a stronger argument than the prize pool, because most entrants know they are
 * not winning the prize pool.
 *
 * 450 frames @ 30fps — 15s, so it loops twice against the 30s main film.
 */

import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

export type PerksProps = { game?: GameKey; entryFee?: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.33, 1, 0.68, 1);
const win = (f: number, a: number, b: number, r = 12) =>
  Math.min(interpolate(f, [a, a + r], [0, 1], clamp), interpolate(f, [b - r, b], [1, 0], clamp));

const CHAT = [
  { u: "riz.", t: "that clutch omg" },
  { u: "sneh", t: "1v3?? no way" },
  { u: "kabir", t: "team B carrying" },
  { u: "aditi", t: "replay that" },
];

const SHORTS = [
  { label: "1v3 CLUTCH", views: "12.4K" },
  { label: "ACE · ROUND 14", views: "8.1K" },
  { label: "THE COMEBACK", views: "5.7K" },
];

export const PerksExplainer: React.FC<PerksProps> = ({ game = "valorant", entryFee = 500 }) => {
  const frame = useCurrentFrame();
  const T = GAME_THEME[game];
  const drift = Math.sin(frame / 80) * 4;

  const wIntro = win(frame, -8, 92, 12);
  const wLive = win(frame, 84, 262, 14);
  const wShorts = win(frame, 254, 412, 14);
  const wEnd = win(frame, 404, 460, 10);

  const viewers = Math.round(interpolate(frame, [120, 240], [0, 1240], { ...clamp, easing: EASE }));

  return (
    <AbsoluteFill style={{ background: "#050506", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 50% at 50% ${10 + drift}%, ${T.soft}, transparent 65%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 40% at ${80 + drift}% 92%, rgba(255,0,60,0.06), transparent 70%)` }} />

      <div style={{ position: "absolute", top: 42, left: 58, right: 58, display: "flex", justifyContent: "space-between", zIndex: 5 }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".2em", color: "#5a5a5a" }}>IESPORTS</span>
        <span style={{ fontSize: 17, color: T.acc, letterSpacing: ".14em", fontWeight: 700 }}>INCLUDED</span>
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 58, right: 58, zIndex: 5 }}>
        <div style={{ height: 3, background: "#161616", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(frame / 450) * 100}%`, background: T.acc, boxShadow: `0 0 14px ${T.glow}` }} />
        </div>
      </div>

      {/* ── intro ── */}
      <AbsoluteFill style={{ padding: "150px 58px 186px", justifyContent: "center", gap: 18, opacity: wIntro }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>YOUR ₹{entryFee} ALSO BUYS</div>
        <div style={{ fontSize: 50, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.08 }}>
          An audience.
        </div>
        <div style={{ fontSize: 20, color: "#8d8d8d", lineHeight: 1.55 }}>
          Not just a lobby and a scoreboard — your matches go out live, and your best round comes back to you.
        </div>
      </AbsoluteFill>

      {/* ── live on youtube ── */}
      <AbsoluteFill style={{ padding: "142px 52px 182px", justifyContent: "center", gap: 16, opacity: wLive }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>PERK 01</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1 }}>
          Every match,<br />streamed live
        </div>

        {/* stream frame */}
        <div style={{
          borderRadius: 16, overflow: "hidden", border: "1px solid #1c1e21", background: "#0b0c0e",
          transform: `scale(${interpolate(frame, [100, 122], [0.95, 1], { ...clamp, easing: EASE })})`,
        }}>
          <div style={{ position: "relative", height: 232, background: "linear-gradient(150deg,#14161a,#0a0b0d)" }}>
            {/* play glyph */}
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 74, height: 52, borderRadius: 13, background: "#ff0033",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 30px rgba(255,0,51,.35)",
            }}>
              <div style={{ width: 0, height: 0, borderLeft: "18px solid #fff", borderTop: "11px solid transparent", borderBottom: "11px solid transparent", marginLeft: 4 }} />
            </div>
            {/* live pill */}
            <div style={{
              position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 7,
              background: "rgba(255,0,51,.14)", border: "1px solid rgba(255,0,51,.5)", borderRadius: 100, padding: "6px 13px",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff0033", opacity: 0.55 + Math.sin(frame / 5) * 0.45 }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#ff5c7a", letterSpacing: ".08em" }}>LIVE</span>
            </div>
            {/* viewer count */}
            <div style={{ position: "absolute", top: 16, right: 16, fontSize: 15, color: "#c9c9c9", fontWeight: 700 }}>
              {viewers.toLocaleString("en-IN")} watching
            </div>
            {/* scrub line */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "#1a1c1f" }}>
              <div style={{ height: "100%", width: `${interpolate(frame, [100, 250], [8, 84], clamp)}%`, background: "#ff0033" }} />
            </div>
          </div>
        </div>

        {/* chat, arriving one line at a time */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {CHAT.map((c, i) => {
            const at = 150 + i * 18;
            const a = interpolate(frame, [at, at + 10], [0, 1], clamp);
            return (
              <div key={c.u} style={{ display: "flex", gap: 9, fontSize: 16, opacity: a, transform: `translateX(${(1 - a) * -10}px)` }}>
                <span style={{ color: T.acc, fontWeight: 700 }}>{c.u}</span>
                <span style={{ color: "#8d8d8d" }}>{c.t}</span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 17, color: "#8d8d8d", opacity: interpolate(frame, [226, 242], [0, 1], clamp) }}>
          Your friends can watch you play. So can everyone else.
        </div>
      </AbsoluteFill>

      {/* ── shorts ── */}
      <AbsoluteFill style={{ padding: "142px 52px 182px", justifyContent: "center", gap: 16, opacity: wShorts }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>PERK 02</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1 }}>
          We cut your best<br />plays into shorts
        </div>
        <div style={{ fontSize: 18, color: "#8d8d8d", lineHeight: 1.5 }}>
          Edited by us, sent to you. Post them wherever you like.
        </div>

        <div style={{ display: "flex", gap: 13, marginTop: 6 }}>
          {SHORTS.map((s, i) => {
            const at = 300 + i * 16;
            const a = interpolate(frame, [at, at + 16], [0, 1], { ...clamp, easing: EASE });
            return (
              <div key={s.label} style={{
                flex: 1, borderRadius: 14, overflow: "hidden",
                border: `1px solid ${i === 0 ? T.line : "#1c1e21"}`,
                background: i === 0 ? T.soft : "#0f1113",
                opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${0.94 + a * 0.06})`,
              }}>
                <div style={{ position: "relative", height: 196, background: "linear-gradient(160deg,#16181c,#0b0c0e)" }}>
                  <div style={{
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
                    width: 0, height: 0, borderLeft: `15px solid ${i === 0 ? T.acc : "#4a4f56"}`,
                    borderTop: "10px solid transparent", borderBottom: "10px solid transparent",
                  }} />
                  <div style={{ position: "absolute", left: 9, bottom: 9, fontSize: 12, color: "#c9c9c9", fontWeight: 700 }}>
                    ▶ {s.views}
                  </div>
                </div>
                <div style={{ padding: "10px 11px", fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", color: i === 0 ? T.acc : "#9a9a9a" }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* ── close ── */}
      <AbsoluteFill style={{ padding: "150px 58px 186px", justifyContent: "center", alignItems: "center", gap: 16, textAlign: "center", opacity: wEnd }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.1 }}>
          Play. Get watched.<br />Get the clips.
        </div>
        <div style={{ fontSize: 20, color: "#8d8d8d" }}>All of it included in your entry.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default PerksExplainer;
