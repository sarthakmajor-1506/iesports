"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Knowledge, KHero, KItem } from "@/lib/quiz";
import {
  Shell, Band, Segment, Field, Panel, Label,
  CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, GOLD, GOLD_FILL, ENEMY, alpha,
  LEMON, MINT, LILAC, ON_FILL, R_CHIP, BW, lift, attrColor, attrFill,
} from "../ui";
import { HeroImg, heroRender } from "../hero-art";
import { Skeleton } from "../theme";

/**
 * Draft Guide — the reference half of the app.
 *
 * Everything here comes from the same `knowledge.json` the quiz is generated
 * from, so what you can be asked is exactly what you can look up, and every
 * picture on this screen was HEAD-checked against the CDN when the file was
 * built rather than assembled from a key and hoped for.
 *
 * Search and the heroes/items switch are pinned. They are the only two controls
 * on the screen and they were previously above a 127-item grid, so using them
 * twice in a row meant scrolling back to the top.
 */
export default function GuidePage() {
  return (
    <Suspense fallback={<Shell tab="guide" head={<Band title="Draft Guide" />}><Skeleton h={160} style={{ marginTop: 13 }} /></Shell>}>
      <Guide />
    </Suspense>
  );
}

const ATTRS = [
  { v: "all", label: "ALL" }, { v: "str", label: "STR" },
  { v: "agi", label: "AGI" }, { v: "int", label: "INT" }, { v: "all_attr", label: "UNI" },
] as const;

function Guide() {
  const params = useSearchParams();
  const [k, setK] = useState<Knowledge | null>(null);
  const [tab, setTab] = useState<"heroes" | "items">("heroes");
  const [search, setSearch] = useState("");
  const [attr, setAttr] = useState<string>("all");
  const [hero, setHero] = useState<KHero | null>(null);
  const [item, setItem] = useState<KItem | null>(null);

  useEffect(() => { fetch("/draftlab/knowledge.json").then((r) => r.json()).then(setK).catch(() => {}); }, []);

  // Deep link from the Picker: /draft/guide?hero=<id>
  const wanted = params.get("hero");
  useEffect(() => {
    if (!k || !wanted) return;
    const h = k.heroes.find((x) => x.id === Number(wanted));
    if (h) setHero(h);
  }, [k, wanted]);

  const heroes = useMemo(() => {
    if (!k) return [];
    const q = search.trim().toLowerCase();
    return k.heroes.filter((h) =>
      (attr === "all" || h.attr === attr) &&
      (!q || h.name.toLowerCase().includes(q) || h.roles.some((r) => r.toLowerCase().includes(q)))
    );
  }, [k, search, attr]);

  const items = useMemo(() => {
    if (!k) return [];
    const q = search.trim().toLowerCase();
    return k.items.filter((i) => !q || i.n.toLowerCase().includes(q));
  }, [k, search]);

  if (!k) {
    return (
      <Shell tab="guide" head={<Band title="Draft Guide" />}>
          <Skeleton h={140} style={{ marginTop: 12 }} />
      </Shell>
    );
  }

  if (hero) return <HeroDetail hero={hero} onBack={() => setHero(null)} />;
  if (item) return <ItemDetail k={k} item={item} onBack={() => setItem(null)} onOpen={(key) => setItem(k.items.find((i) => i.k === key) ?? item)} />;

  return (
    <Shell
      tab="guide"
      head={
        <Band title="Draft Guide" compact accent={LILAC} sub={`Patch ${k.patch} · ${k.heroes.length} heroes · ${k.items.length} items`}>
          <div style={{ display: "flex", gap: 6, margin: "9px 0 0" }}>
            <div style={{ flex: "0 0 40%" }}>
              <Segment dense value={tab} onChange={setTab}
                options={[{ v: "heroes", label: "HEROES" }, { v: "items", label: "ITEMS" }]} />
            </div>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}`}
              style={{ flex: "1 1 auto", padding: "6px 10px", minHeight: 34 }} />
          </div>
          {tab === "heroes" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {ATTRS.map((a) => {
                const on = attr === a.v;
                const f = a.v === "all" ? GOLD_FILL : attrFill(a.v);
                return (
                  <button key={a.v} className="dl-btn dl-flat" onClick={() => setAttr(a.v)} style={{
                    flex: "1 1 0", padding: "5px 2px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    background: on ? f : PANEL, color: on ? ON_FILL : DIM,
                    border: `2px solid ${LINE}`, fontSize: 9.5, fontWeight: 900, letterSpacing: .5,
                  }}>{a.label}</button>
                );
              })}
            </div>
          )}
        </Band>
      }
    >

      {tab === "heroes" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(52px, 15vw, 66px), 1fr))", gap: 7, padding: "11px 0 16px" }}>
          {heroes.map((h) => (
            <button key={h.id} className="dl-pick" onClick={() => setHero(h)} style={{
              padding: 0, border: `${BW}px solid ${LINE}`, borderRadius: R_CHIP, overflow: "hidden", boxSizing: "border-box",
              background: "var(--tile)", cursor: "pointer", position: "relative", aspectRatio: "3 / 4", ...lift(2),
            }}>
              <HeroImg base={h.base} name={h.name} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#16131F", padding: "2px 3px" }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "#FFF7EA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
              </div>
              {/* The attribute dot, as an ink-outlined pastel pip — the same
                  marker the client puts on a hero, drawn in this vocabulary. */}
              <span style={{
                position: "absolute", top: 4, right: 4, width: 9, height: 9, borderRadius: 5,
                background: attrFill(h.attr), border: `1.5px solid ${LINE}`, boxSizing: "border-box",
              }} />
            </button>
          ))}
          {heroes.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, padding: 10 }}>Nothing matches.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6, padding: "11px 0 16px" }}>
          {items.map((i) => (
            <button key={i.k} className="dl-btn" onClick={() => setItem(i)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 11px", borderRadius: R_CHIP,
              background: PANEL, border: `2px solid ${LINE}`, color: CREAM, cursor: "pointer", textAlign: "left",
              fontFamily: "inherit", boxSizing: "border-box", ...lift(3),
            }}>
              <ItemImg item={i} w={42} h={31} />
              <span style={{ flex: "1 1 auto", fontSize: 13, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.n}</span>
              {i.neutral && <span style={{ fontSize: 8.5, color: ON_FILL, background: MINT, border: `1.5px solid ${LINE}`, borderRadius: 999, padding: "1px 6px", fontWeight: 900, flexShrink: 0 }}>T{i.tier}</span>}
              <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i.cost}</span>
            </button>
          ))}
          {items.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, padding: 10 }}>Nothing matches.</div>}
        </div>
      )}
    </Shell>
  );
}

/** Item art, with the same never-blank contract the hero images have. */
function ItemImg({ item, w, h }: { item: KItem; w: number; h: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [item.k]);
  if (!item.img || failed) {
    return (
      <div style={{
        width: w, height: h, flexShrink: 0, borderRadius: 6, background: PANEL_2, display: "grid",
        placeItems: "center", color: DIM, fontSize: 12, fontWeight: 900,
        border: `1.5px solid ${LINE}`, boxSizing: "border-box",
      }}>
        {item.n.slice(0, 1)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.img} alt="" loading="lazy" onError={() => setFailed(true)}
      style={{
        width: w, height: h, objectFit: "contain", borderRadius: 6, flexShrink: 0, display: "block",
        border: `1.5px solid ${LINE}`, background: "var(--tile)", boxSizing: "border-box",
      }} />
  );
}

/* ---------------------------------------------------------------- details */

function HeroDetail({ hero, onBack }: { hero: KHero; onBack: () => void }) {
  const s = hero.stats;

  const f = attrFill(hero.attr);
  return (
    <Shell tab="guide" head={<Band title={hero.name} compact accent={f} onBack={onBack}
      sub={`${hero.attr === "all" ? "Universal" : hero.attr.toUpperCase()} · ${hero.atk} · ${hero.roles.join(", ")}`} />}>

      <Showcase hero={hero} />

      <div style={{ display: "flex", gap: 6, margin: "11px 0 9px" }}>
        <Stat label="DAMAGE" value={`${s.dmgMin}-${s.dmgMax}`} />
        <Stat label="ARMOR" value={s.armor.toFixed(1)} />
        <Stat label="SPEED" value={String(s.ms)} />
        <Stat label="RANGE" value={s.range > 200 ? String(s.range) : "melee"} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 11 }}>
        <Attr label="STR" v={s.str} g={s.strG} on={hero.attr === "str"} fill={attrFill("str")} />
        <Attr label="AGI" v={s.agi} g={s.agiG} on={hero.attr === "agi"} fill={attrFill("agi")} />
        <Attr label="INT" v={s.int} g={s.intG} on={hero.attr === "int"} fill={attrFill("int")} />
      </div>

      {hero.pubWin != null && (
        <Panel style={{ marginBottom: 11, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <Label style={{ marginBottom: 2 }}>PUB WIN RATE</Label>
            <span style={{ fontSize: 18, fontWeight: 900, color: hero.pubWin >= 0.5 ? GREEN : ENEMY, fontVariantNumeric: "tabular-nums" }}>
              {(hero.pubWin * 100).toFixed(1)}%
            </span>
          </div>
          <span style={{ flex: "1 1 auto" }} />
          <div style={{ textAlign: "right" }}>
            <Label style={{ marginBottom: 2 }}>PICKED</Label>
            <span style={{ fontSize: 13, color: MUTED, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {(hero.pubPick ?? 0).toLocaleString()}
            </span>
          </div>
        </Panel>
      )}

      <div style={{ marginBottom: 9 }}>
        <span className="dl-stk" style={{ background: LEMON, fontSize: 9 }}>ABILITIES</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {hero.abilities.map((a) => (
          <Panel key={a.k} style={{ padding: "10px 11px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.img} alt="" loading="lazy" style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "var(--tile)",
                border: `2px solid ${LINE}`, boxShadow: `2px 2px 0 ${LINE}`, boxSizing: "border-box",
                objectFit: "cover",
              }} />
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-.02em" }}>{a.n}</span>
                  {a.ult && <Tag fill={GOLD_FILL}>ULT</Tag>}
                  {a.innate && <Tag fill={f}>INNATE</Tag>}
                  {a.pierces && <Tag fill={attrFill("str")}>PIERCES BKB</Tag>}
                </div>
                <div style={{ fontSize: 10, color: DIM, fontWeight: 700, marginTop: 2 }}>
                  {[a.behavior, a.dmg && `${a.dmg} damage`].filter(Boolean).join(" · ")}
                </div>
                {a.desc && <div style={{ fontSize: 12.5, color: CREAM, fontWeight: 600, marginTop: 6, lineHeight: 1.45 }}>{a.desc}</div>}
                {(a.cd || a.mc) && (
                  <div style={{ display: "flex", gap: 11, marginTop: 6 }}>
                    {a.cd && <span style={{ fontSize: 11, color: MUTED, fontWeight: 800 }}>⟳ {a.cd}s</span>}
                    {a.mc && <span style={{ fontSize: 11, color: attrColor("int"), fontWeight: 800 }}>◆ {a.mc}</span>}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {hero.talents.length > 0 && (
        <>
          <div style={{ margin: "16px 0 9px" }}>
            <span className="dl-stk" style={{ background: GOLD_FILL, fontSize: 9 }}>TALENTS</span>
          </div>
          <Panel style={{ padding: "9px 12px" }}>
            {hero.talents.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 9, padding: "3px 0", fontSize: 12 }}>
                <span style={{ color: GOLD, fontWeight: 900, width: 26, flexShrink: 0 }}>L{t.lvl * 5 + 5}</span>
                <span style={{ color: CREAM, fontWeight: 600 }}>{t.n}</span>
              </div>
            ))}
          </Panel>
        </>
      )}

      <div style={{ height: 18 }} />
    </Shell>
  );
}

/**
 * The hero on black, animated where Valve publishes a render.
 *
 * Both layers are `contain` on the same box, so the crossfade from still to
 * render cannot change the framing — mixing `cover` and `contain`, or a
 * landscape still under a square video, is what made this jump.
 */
function Showcase({ hero }: { hero: KHero }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [hero.id]);
  const fit: React.CSSProperties = {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    objectFit: "contain", objectPosition: "50% 50%", display: "block",
  };
  return (
    <div style={{
      position: "relative", height: "clamp(180px, 42vw, 240px)", marginTop: 11,
      borderRadius: 16, overflow: "hidden", boxSizing: "border-box",
      border: `3px solid ${LINE}`, boxShadow: `5px 5px 0 ${LINE}`,
      // The showcase keeps a dark bed like every other piece of hero art, tinted
      // toward the hero's attribute so the four groups are told apart at a
      // glance. The tint has to be mixed with `alpha()` rather than by appending
      // hex digits: these colours are CSS variables now, and `var(--agi)22` is
      // not a colour — it silently rendered at full strength.
      background: `radial-gradient(70% 70% at 50% 40%, ${alpha(attrColor(hero.attr), 30)}, #0C0A12 72%)`,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero.art.portrait ?? hero.art.crop ?? ""} alt={hero.name}
        style={{ ...fit, opacity: ready ? 0 : 1, transition: "opacity .5s ease" }} />
      {hero.art.render && (
        <video src={heroRender(hero.base)} autoPlay loop muted playsInline preload="auto"
          onCanPlay={() => setReady(true)}
          style={{ ...fit, opacity: ready ? 1 : 0, transition: "opacity .5s ease" }} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: "1 1 0", background: PANEL, border: `2px solid ${LINE}`, borderRadius: R_CHIP,
      boxShadow: `2px 2px 0 ${LINE}`, padding: "7px 4px", textAlign: "center", minWidth: 0, boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: CREAM, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 8, letterSpacing: .8, color: DIM, fontWeight: 900, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/**
 * One of the three attribute tiles. The hero's primary attribute is the one
 * FILLED — a tint plus a coloured border was the old tell, and at these sizes on
 * paper the three tiles looked identical.
 */
function Attr({ label, v, g, on, fill }: { label: string; v: number; g: number; on: boolean; fill: string }) {
  return (
    <div style={{
      flex: "1 1 0", borderRadius: R_CHIP, padding: "7px 4px", textAlign: "center", minWidth: 0, boxSizing: "border-box",
      background: on ? fill : PANEL, color: on ? ON_FILL : CREAM,
      border: `2px solid ${LINE}`, boxShadow: `2px 2px 0 ${LINE}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
        {v}<span style={{ fontSize: 10, color: on ? ON_FILL : MUTED, opacity: on ? .65 : 1, fontWeight: 800 }}> +{g}</span>
      </div>
      <div style={{ fontSize: 8, letterSpacing: .8, color: on ? ON_FILL : DIM, opacity: on ? .75 : 1, fontWeight: 900, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Tag({ children, fill }: { children: React.ReactNode; fill: string }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 900, letterSpacing: .6, borderRadius: 999, padding: "2px 7px",
      color: ON_FILL, background: fill, border: `1.5px solid ${LINE}`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function ItemDetail({ k, item, onBack, onOpen }: { k: Knowledge; item: KItem; onBack: () => void; onOpen: (key: string) => void }) {
  const byKey = new Map(k.items.map((i) => [i.k, i]));
  const parts = (item.components ?? []).map((c) => byKey.get(c)).filter(Boolean) as KItem[];
  const buildsInto = k.items.filter((i) => i.components?.includes(item.k));
  return (
    <Shell tab="guide" head={<Band title={item.n} compact accent={GOLD_FILL} onBack={onBack} sub={`${item.cost} gold${item.qual ? ` · ${item.qual}` : ""}`} />}>

      <Panel style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 13, background: GOLD_FILL, color: ON_FILL }}>
        <ItemImg item={item} w={64} h={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-.02em", overflow: "hidden", textOverflow: "ellipsis" }}>{item.n}</div>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.25 }}>{item.cost}</div>
          {item.behavior && <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .7, marginTop: 1 }}>{item.behavior}</div>}
        </div>
      </Panel>

      {item.desc && (
        <Panel style={{ marginTop: 9 }}>
          <Label>WHAT IT DOES</Label>
          <div style={{ fontSize: 12.5, color: CREAM, fontWeight: 600, lineHeight: 1.5 }}>{item.desc}</div>
          {item.notes && item.notes !== item.desc && (
            <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, marginTop: 8, lineHeight: 1.45 }}>{item.notes}</div>
          )}
        </Panel>
      )}

      {parts.length > 0 && <ItemRow title="BUILDS FROM" items={parts} onOpen={onOpen} fill={MINT} />}
      {buildsInto.length > 0 && <ItemRow title="BUILDS INTO" items={buildsInto} onOpen={onOpen} fill={GOLD_FILL} />}

      {item.lore && (
        <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5, padding: "16px 2px 18px", fontStyle: "italic" }}>{item.lore}</div>
      )}
      <div style={{ height: 10 }} />
    </Shell>
  );
}

function ItemRow({ title, items, onOpen, fill }: { title: string; items: KItem[]; onOpen: (key: string) => void; fill: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 8 }}>
        <span className="dl-stk" style={{ background: fill, fontSize: 9 }}>{title}</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((i) => (
          <button key={i.k} className="dl-btn" onClick={() => onOpen(i.k)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "6px 11px", borderRadius: R_CHIP,
            background: PANEL, border: `2px solid ${LINE}`, color: CREAM, cursor: "pointer", textAlign: "left",
            fontFamily: "inherit", boxSizing: "border-box", ...lift(3),
          }}>
            <ItemImg item={i} w={38} h={28} />
            <span style={{ flex: "1 1 auto", fontSize: 12.5, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.n}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, flexShrink: 0 }}>{i.cost}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
