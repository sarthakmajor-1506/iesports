"use client";

/**
 * "Why play with IEsports?" — the second film, beside the main explainer on
 * desktop where a lone 4:5 frame leaves dead space either side.
 *
 * The main film answers "how does this work". This answers "why here and not a
 * scrim with friends", which is the harder question. Three answers, in the
 * order they matter to someone weighing the entry: your matches get an audience,
 * your best round comes back as something you can post, and you leave knowing
 * more about your own play than when you arrived.
 *
 * LOOK. Same kit as the main film (./kit) — they play side by side, so they
 * must read as one product: cream page, ink outlines, sticker labels, and the
 * beat's title held in the header slot at the top. The intro lists all three
 * perks up front, so the viewer knows what the next 20 seconds contain.
 *
 * IMAGERY. The thumbnails are real photographs from IEsports events already
 * shipping on the site, not stock or generated art. Actual Indian players
 * holding an actual trophy is more persuasive than anything a stock library
 * has, and it avoids putting someone else's copyrighted screenshots into a
 * film that promotes a paid tournament.
 *
 * 600 frames @ 30fps — 20s.
 */

import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";
import {
  type HeaderSpec,
  INK, PAPER, CARD, BODY, LILAC, LEMON, PINK, MINT, OK_TEXT, BAD_TEXT, FONT,
  PAD_X, BODY_TOP, clamp, EASE, beat, popIn,
  Backdrop, TopBar, ProgressBar, HeaderSlot, Sticker, Mark,
} from "./kit";

/** `perTeam` says the fee buys a whole roster, not one seat (team registration). */
export type PerksProps = { game?: GameKey; entryFee?: number; perTeam?: boolean; teamSize?: number };

const DUR = 600;
const LIVE_RED = "#FF3B5C";

const B = {
  intro: [-8, 88], live: [82, 252], shorts: [246, 412], ai: [406, 552], end: [546, 610],
} as const;

/** The three perks, as the intro lists them and the beats deliver them. */
const PERKS = [
  { n: "01", emoji: "📺", title: "Streamed live", sub: "Every match, on stream", bg: PINK },
  { n: "02", emoji: "🎬", title: "Your plays as shorts", sub: "Edited by us, sent to you", bg: LILAC },
  { n: "03", emoji: "🧠", title: "AI breakdown", sub: "What worked, what cost you", bg: MINT },
];

// Kept free of team names: under team registration the rosters are named by
// their captains, so "team B" would date the film to the shuffled-draw format.
const CHAT = [
  { u: "riz.", t: "that clutch omg", bg: LEMON },
  { u: "sneh", t: "1v3?? no way", bg: LILAC },
  { u: "kabir", t: "these guys carrying fr", bg: MINT },
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

const inr = (n: number) => Number(n).toLocaleString("en-IN");

export const PerksExplainer: React.FC<PerksProps> = ({ game = "valorant", entryFee = 500, perTeam = false, teamSize = 5 }) => {
  const frame = useCurrentFrame();
  const T = GAME_THEME[game];
  const float = Math.sin(frame / 45) * 3;
  const M = (s: React.ReactNode) => <Mark c={T.acc}>{s}</Mark>;

  const headers: HeaderSpec[] = [
    {
      a: B.intro[0], b: B.intro[1], bg: LEMON,
      eyebrow: perTeam ? `₹${inr(entryFee)} for ${teamSize} · all included` : `Your ₹${inr(entryFee)} · all included`,
      title: <>Why play with<br />{M("IEsports?")}</>,
    },
    { a: B.live[0], b: B.live[1], bg: PINK, eyebrow: "Perk 01 · live stream", title: <>Every match,<br />{M("streamed live")}</> },
    { a: B.shorts[0], b: B.shorts[1], bg: LILAC, eyebrow: "Perk 02 · shorts", title: <>Your best plays,<br />{M("cut into shorts")}</> },
    { a: B.ai[0], b: B.ai[1], bg: MINT, eyebrow: "Perk 03 · AI coach", title: <>AI breaks down<br />{M("your game")}</> },
    { a: B.end[0], b: B.end[1], bg: PINK, eyebrow: "In your entry", title: <>All of it,<br />{M("included.")}</> },
  ];

  const panel: React.CSSProperties = { position: "absolute", left: PAD_X, right: PAD_X, top: BODY_TOP };
  const viewers = Math.round(interpolate(frame, [110, 230], [0, 1240], { ...clamp, easing: EASE }));

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: FONT, color: INK, overflow: "hidden" }}>
      <Backdrop frame={frame} T={T} />
      <TopBar frame={frame} T={T} label={T.label} />
      <HeaderSlot frame={frame} specs={headers} />

      <AbsoluteFill style={{ transform: `translateY(${float}px)` }}>

        {/* ── intro: what the next 20 seconds contain ── */}
        <AbsoluteFill style={beat(frame, B.intro[0], B.intro[1], 12)}>
          <div style={panel}>
            <Text>Three things you don&apos;t get from a scrim with friends.</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
              {PERKS.map((p, i) => (
                <div key={p.n} style={{
                  display: "flex", alignItems: "center", gap: 16, height: 88, boxSizing: "border-box", padding: "0 18px 0 14px",
                  background: CARD, border: `3px solid ${INK}`, borderRadius: 18, boxShadow: `5px 5px 0 ${INK}`,
                  transform: `rotate(${(i - 1) * 0.8}deg) scale(${popIn(frame, 6 + i * 8, 12, 0.5)})`,
                }}>
                  <div style={{
                    width: 56, height: 56, flex: "none", boxSizing: "border-box", borderRadius: "50%", background: p.bg, border: `3px solid ${INK}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 900,
                  }}>{p.n}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 23, fontWeight: 900, letterSpacing: "-.01em" }}>{p.title}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: BODY, marginTop: 2 }}>{p.sub}</div>
                  </div>
                  <div style={{ fontSize: 38, transform: `rotate(${Math.sin((frame + i * 20) / 8) * 8}deg)` }}>{p.emoji}</div>
                </div>
              ))}
            </div>
          </div>
        </AbsoluteFill>

        {/* ── perk 01 · live ── */}
        <AbsoluteFill style={beat(frame, B.live[0], B.live[1], 13)}>
          <div style={panel}>
            <div style={{
              background: CARD, border: `3px solid ${INK}`, borderRadius: 20, boxShadow: `6px 6px 0 ${INK}`, overflow: "hidden",
              transform: `rotate(-0.8deg) scale(${popIn(frame, B.live[0] + 8, 14, 0.85)})`,
            }}>
              <div style={{ position: "relative", height: 214, borderBottom: `3px solid ${INK}` }}>
                <Img src={staticFile("valorantimg3.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{
                  position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 7, padding: "5px 12px",
                  background: LIVE_RED, border: `2.5px solid ${INK}`, borderRadius: 100, boxShadow: `3px 3px 0 ${INK}`,
                  color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: ".08em",
                }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", opacity: 0.45 + Math.sin(frame / 5) * 0.55 }} />
                  LIVE
                </div>
                <div style={{ position: "absolute", top: 12, right: 12 }}>
                  <Sticker bg={CARD} rot={2} size={13}>{viewers.toLocaleString("en-IN")} watching</Sticker>
                </div>
                <div style={{
                  position: "absolute", left: "50%", top: "50%", width: 78, height: 56, marginLeft: -39, marginTop: -28, boxSizing: "border-box",
                  borderRadius: 14, background: LIVE_RED, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transform: `scale(${1 + Math.max(0, Math.sin(frame / 7)) * 0.06})`,
                }}>
                  <div style={{ width: 0, height: 0, borderLeft: "20px solid #fff", borderTop: "12px solid transparent", borderBottom: "12px solid transparent", marginLeft: 5 }} />
                </div>
              </div>
              <div style={{ height: 14, background: PAPER }}>
                <div style={{ height: "100%", width: `${interpolate(frame, [96, 240], [8, 84], clamp)}%`, background: LIVE_RED, borderRight: `2.5px solid ${INK}` }} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              {CHAT.map((c, i) => {
                const at = 142 + i * 16;
                const a = interpolate(frame, [at, at + 10], [0, 1], clamp);
                return (
                  <div key={c.u} style={{ display: "flex", alignItems: "center", gap: 10, opacity: a, transform: `translateX(${(1 - a) * -18}px) scale(${popIn(frame, at, 10, 0.7)})`, transformOrigin: "left center" }}>
                    <div style={{
                      width: 38, height: 38, flex: "none", boxSizing: "border-box", borderRadius: "50%", background: c.bg, border: `2.5px solid ${INK}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900,
                    }}>{c.u[0].toUpperCase()}</div>
                    <div style={{ padding: "7px 14px", background: CARD, border: `2.5px solid ${INK}`, borderRadius: "16px 16px 16px 4px", fontSize: 17 }}>
                      <b>{c.u}</b> <span style={{ color: BODY, fontWeight: 600 }}>{c.t}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 20, opacity: interpolate(frame, [206, 220], [0, 1], clamp) }}>
              Your friends can watch you play. <Mark c={T.acc}>So can everyone else.</Mark>
            </div>
          </div>
        </AbsoluteFill>

        {/* ── perk 02 · shorts ── */}
        <AbsoluteFill style={beat(frame, B.shorts[0], B.shorts[1], 13)}>
          <div style={panel}>
            <Text>Edited by us, sent to you. Post them wherever you like.</Text>
            <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
              {SHORTS.map((s, i) => {
                const at = B.shorts[0] + 26 + i * 12;
                const a = interpolate(frame, [at, at + 12], [0, 1], clamp);
                return (
                  <div key={s.label} style={{
                    flex: 1, boxSizing: "border-box", border: `3px solid ${INK}`, borderRadius: 22, boxShadow: `5px 5px 0 ${INK}`,
                    overflow: "hidden", background: CARD, opacity: a,
                    transform: `translateY(${(1 - a) * 40}px) rotate(${[-3, 2, -2][i]}deg) scale(${popIn(frame, at, 12, 0.8)})`,
                  }}>
                    <div style={{ position: "relative", height: 262, borderBottom: `3px solid ${INK}` }}>
                      <Img src={staticFile(s.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{
                        position: "absolute", left: "50%", top: "44%", width: 50, height: 50, marginLeft: -25, marginTop: -25, boxSizing: "border-box",
                        borderRadius: "50%", background: CARD, border: `3px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{ width: 0, height: 0, borderLeft: `15px solid ${INK}`, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", marginLeft: 4 }} />
                      </div>
                      <div style={{ position: "absolute", left: 8, bottom: 10 }}>
                        <Sticker bg={CARD} rot={0} size={11}>▶ {s.views}</Sticker>
                      </div>
                    </div>
                    <div style={{ padding: "11px 8px", textAlign: "center", fontSize: 14, fontWeight: 900, letterSpacing: ".04em", background: i === 0 ? T.acc : CARD }}>
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>

        {/* ── perk 03 · AI insights ── */}
        <AbsoluteFill style={beat(frame, B.ai[0], B.ai[1], 13)}>
          <div style={panel}>
            <Text>Every round read back to you — what worked, what cost you.</Text>
            <div style={{
              marginTop: 16, background: CARD, border: `3px solid ${INK}`, borderRadius: 20, boxShadow: `6px 6px 0 ${INK}`, overflow: "hidden",
              transform: `scale(${popIn(frame, B.ai[0] + 14, 14, 0.9)})`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", background: PAPER, borderBottom: `3px solid ${INK}` }}>
                <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".14em" }}>🧠 YOUR MATCH REPORT</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: BODY }}>after every match</span>
              </div>
              {INSIGHTS.map((r, i) => {
                const at = 442 + i * 16;
                const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
                return (
                  <div key={r.k} style={{
                    display: "flex", alignItems: "center", gap: 12, height: 64, padding: "0 18px",
                    borderTop: i ? `2px solid ${INK}1f` : "none",
                    opacity: a, transform: `translateX(${(1 - a) * -16}px)`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{r.k}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: r.good ? OK_TEXT : BAD_TEXT, marginTop: 1 }}>{r.note}</div>
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 900, padding: "4px 12px", borderRadius: 12, border: `2.5px solid ${INK}`,
                      background: r.good ? MINT : PINK, transform: `scale(${popIn(frame, at + 4, 10, 0.5)})`,
                    }}>{r.v}</div>
                  </div>
                );
              })}
            </div>

            {/* The tip as a sticky note — the one line a player acts on. */}
            <div style={{
              marginTop: 22, padding: "13px 16px", background: LEMON, border: `3px solid ${INK}`, borderRadius: 8, boxShadow: `5px 5px 0 ${INK}`,
              opacity: interpolate(frame, [500, 510], [0, 1], clamp),
              transform: `rotate(-1.8deg) scale(${popIn(frame, 500, 14, 0.7)})`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".14em" }}>✦ NEXT TIME</div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, marginTop: 4 }}>
                Hold your post-plant angle 3s longer — you&apos;re peeking into retakes you don&apos;t need to take.
              </div>
            </div>
          </div>
        </AbsoluteFill>

        {/* ── close ── */}
        <AbsoluteFill style={beat(frame, B.end[0], B.end[1], 11)}>
          <div style={{ ...panel, top: BODY_TOP + 30, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {[
              { t: "📺 Get watched.", bg: PINK, rot: -3 },
              { t: "🎬 Get the clips.", bg: LILAC, rot: 2 },
              { t: "🧠 Get better.", bg: MINT, rot: 2 },
            ].map((s, i) => (
              // Fixed-height rows: rotated stickers of different widths
              // otherwise leave visibly uneven gaps between them.
              <div key={s.t} style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ transform: `scale(${popIn(frame, B.end[0] + 6 + i * 7, 12, 0)})` }}>
                  <Sticker bg={s.bg} rot={s.rot} size={30}>{s.t}</Sticker>
                </div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      <ProgressBar frame={frame} dur={DUR} T={T} />
    </AbsoluteFill>
  );
};

const Text: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 19, color: BODY, fontWeight: 600, lineHeight: 1.45 }}>{children}</div>
);

export default PerksExplainer;
