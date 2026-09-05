"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Knowledge, KHero, KItem } from "@/lib/quiz";
import {
  Shell, Band, Segment, Field, Panel, Label,
  RED, CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, GOLD, BLUE, attrColor,
} from "../ui";
import { DraftStyles, HeroImg, heroRender } from "../hero-art";

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
    <Suspense fallback={<Shell tab="guide" head={<Band title="Draft Guide" />}><DraftStyles /></Shell>}>
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
        <DraftStyles />
        <div className="dl-sheen" style={{ height: 140, borderRadius: 14, background: PANEL, marginTop: 12 }} />
      </Shell>
    );
  }

  if (hero) return <HeroDetail hero={hero} onBack={() => setHero(null)} />;
  if (item) return <ItemDetail k={k} item={item} onBack={() => setItem(null)} onOpen={(key) => setItem(k.items.find((i) => i.k === key) ?? item)} />;

  return (
    <Shell
      tab="guide"
      head={
        <Band title="Draft Guide" compact sub={`Patch ${k.patch} · ${k.heroes.length} heroes · ${k.items.length} items`}>
          <div style={{ display: "flex", gap: 6, margin: "9px 0 0" }}>
            <div style={{ flex: "0 0 40%" }}>
              <Segment dense value={tab} onChange={setTab}
                options={[{ v: "heroes", label: "HEROES" }, { v: "items", label: "ITEMS" }]} />
            </div>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}`}
              style={{ flex: "1 1 auto", padding: "6px 10px", minHeight: 34 }} />
          </div>
          {tab === "heroes" && (
            <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
              {ATTRS.map((a) => {
                const on = attr === a.v;
                const c = a.v === "all" ? GOLD : attrColor(a.v);
                return (
                  <button key={a.v} className="dl-btn" onClick={() => setAttr(a.v)} style={{
                    flex: "1 1 0", padding: "4px 2px", borderRadius: 7, cursor: "pointer",
                    background: on ? c : "transparent", color: on ? "#0b0810" : MUTED,
                    border: `1px solid ${on ? c : LINE}`, fontSize: 9.5, fontWeight: 900, letterSpacing: .5,
                  }}>{a.label}</button>
                );
              })}
            </div>
          )}
        </Band>
      }
    >
      <DraftStyles />

      {tab === "heroes" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(74px, 23vw, 96px), 1fr))", gap: 6, padding: "10px 0 16px" }}>
          {heroes.map((h) => (
            <button key={h.id} className="dl-pick" onClick={() => setHero(h)} style={{
              padding: 0, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden",
              background: "#0c0a12", cursor: "pointer", position: "relative", aspectRatio: "3 / 4",
            }}>
              <HeroImg base={h.base} name={h.name} />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "linear-gradient(transparent, rgba(4,3,7,.95))", padding: "13px 4px 4px" }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
              </div>
              <span style={{
                position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 4,
                background: attrColor(h.attr), boxShadow: `0 0 7px ${attrColor(h.attr)}`,
              }} />
            </button>
          ))}
          {heroes.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, padding: 10 }}>Nothing matches.</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4, padding: "10px 0 16px" }}>
          {items.map((i) => (
            <button key={i.k} className="dl-btn" onClick={() => setItem(i)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 10,
              background: PANEL, border: `1px solid ${LINE}`, color: CREAM, cursor: "pointer", textAlign: "left",
            }}>
              <ItemImg item={i} w={42} h={31} />
              <span style={{ flex: "1 1 auto", fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.n}</span>
              {i.neutral && <span style={{ fontSize: 8.5, color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 4, padding: "1px 4px", fontWeight: 800, flexShrink: 0 }}>T{i.tier}</span>}
              <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{i.cost}</span>
            </button>
          ))}
          {items.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, padding: 10 }}>Nothing matches.</div>}
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
      <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 5, background: PANEL_2, display: "grid", placeItems: "center", color: DIM, fontSize: 12, fontWeight: 900 }}>
        {item.n.slice(0, 1)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.img} alt="" loading="lazy" onError={() => setFailed(true)}
      style={{ width: w, height: h, objectFit: "contain", borderRadius: 5, flexShrink: 0, display: "block" }} />
  );
}

/* ---------------------------------------------------------------- details */

function HeroDetail({ hero, onBack }: { hero: KHero; onBack: () => void }) {
  const s = hero.stats;
  const c = attrColor(hero.attr);
  return (
    <Shell tab="guide" head={<Band title={hero.name} compact accent={c} onBack={onBack}
      sub={`${hero.attr === "all" ? "Universal" : hero.attr.toUpperCase()} · ${hero.atk} · ${hero.roles.join(", ")}`} />}>
      <DraftStyles />

      <Showcase hero={hero} />

      <div style={{ display: "flex", gap: 4, margin: "10px 0 8px" }}>
        <Stat label="DAMAGE" value={`${s.dmgMin}-${s.dmgMax}`} />
        <Stat label="ARMOR" value={s.armor.toFixed(1)} />
        <Stat label="SPEED" value={String(s.ms)} />
        <Stat label="RANGE" value={s.range > 200 ? String(s.range) : "melee"} />
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <Attr label="STR" v={s.str} g={s.strG} on={hero.attr === "str"} color={RED} />
        <Attr label="AGI" v={s.agi} g={s.agiG} on={hero.attr === "agi"} color={GREEN} />
        <Attr label="INT" v={s.int} g={s.intG} on={hero.attr === "int"} color={BLUE} />
      </div>

      {hero.pubWin != null && (
        <Panel style={{ marginBottom: 10, padding: "9px 11px", display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <Label style={{ marginBottom: 2 }}>PUB WIN RATE</Label>
            <span style={{ fontSize: 18, fontWeight: 900, color: hero.pubWin >= 0.5 ? GREEN : RED, fontVariantNumeric: "tabular-nums" }}>
              {(hero.pubWin * 100).toFixed(1)}%
            </span>
          </div>
          <span style={{ flex: "1 1 auto" }} />
          <div style={{ textAlign: "right" }}>
            <Label style={{ marginBottom: 2 }}>PICKED</Label>
            <span style={{ fontSize: 13, color: MUTED, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {(hero.pubPick ?? 0).toLocaleString()}
            </span>
          </div>
        </Panel>
      )}

      <Label color={GOLD}>ABILITIES</Label>
      <div style={{ display: "grid", gap: 6 }}>
        {hero.abilities.map((a) => (
          <Panel key={a.k} style={{ padding: "10px 11px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.img} alt="" loading="lazy" style={{
                width: 42, height: 42, borderRadius: 9, flexShrink: 0, background: "#0c0a12",
                border: `1px solid ${a.ult ? GOLD : a.innate ? c : LINE}`,
                objectFit: "cover",
              }} />
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{a.n}</span>
                  {a.ult && <Tag color={GOLD} solid>ULT</Tag>}
                  {a.innate && <Tag color={c}>INNATE</Tag>}
                  {a.pierces && <Tag color={RED}>PIERCES BKB</Tag>}
                </div>
                <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>
                  {[a.behavior, a.dmg && `${a.dmg} damage`].filter(Boolean).join(" · ")}
                </div>
                {a.desc && <div style={{ fontSize: 12.5, color: CREAM, marginTop: 5, lineHeight: 1.45 }}>{a.desc}</div>}
                {(a.cd || a.mc) && (
                  <div style={{ display: "flex", gap: 11, marginTop: 5 }}>
                    {a.cd && <span style={{ fontSize: 11, color: MUTED }}>⟳ {a.cd}s</span>}
                    {a.mc && <span style={{ fontSize: 11, color: BLUE }}>◆ {a.mc}</span>}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {hero.talents.length > 0 && (
        <>
          <Label style={{ marginTop: 14 }}>TALENTS</Label>
          <Panel style={{ padding: "8px 11px" }}>
            {hero.talents.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12 }}>
                <span style={{ color: GOLD, fontWeight: 900, width: 26, flexShrink: 0 }}>L{t.lvl * 5 + 5}</span>
                <span style={{ color: CREAM }}>{t.n}</span>
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
      position: "relative", height: "clamp(180px, 42vw, 240px)", marginTop: 10,
      borderRadius: 14, overflow: "hidden", border: `1px solid ${LINE}`,
      background: `radial-gradient(70% 70% at 50% 40%, ${attrColor(hero.attr)}22, #08070c 70%)`,
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
    <div style={{ flex: "1 1 0", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: "7px 4px", textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: CREAM, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 8, letterSpacing: .8, color: DIM, fontWeight: 800, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Attr({ label, v, g, on, color }: { label: string; v: number; g: number; on: boolean; color: string }) {
  return (
    <div style={{
      flex: "1 1 0", borderRadius: 10, padding: "7px 4px", textAlign: "center", minWidth: 0,
      background: on ? `${color}1c` : PANEL, border: `1px solid ${on ? color + "66" : LINE}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: on ? color : CREAM, fontVariantNumeric: "tabular-nums" }}>
        {v}<span style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}> +{g}</span>
      </div>
      <div style={{ fontSize: 8, letterSpacing: .8, color: on ? color : DIM, fontWeight: 800, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Tag({ children, color, solid }: { children: React.ReactNode; color: string; solid?: boolean }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 900, letterSpacing: .5, borderRadius: 4, padding: "2px 4px",
      color: solid ? "#140f06" : color, background: solid ? color : "transparent",
      border: solid ? "none" : `1px solid ${color}66`,
    }}>{children}</span>
  );
}

function ItemDetail({ k, item, onBack, onOpen }: { k: Knowledge; item: KItem; onBack: () => void; onOpen: (key: string) => void }) {
  const byKey = new Map(k.items.map((i) => [i.k, i]));
  const parts = (item.components ?? []).map((c) => byKey.get(c)).filter(Boolean) as KItem[];
  const buildsInto = k.items.filter((i) => i.components?.includes(item.k));
  return (
    <Shell tab="guide" head={<Band title={item.n} compact onBack={onBack} sub={`${item.cost} gold${item.qual ? ` · ${item.qual}` : ""}`} />}>
      <DraftStyles />

      <Panel style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, background: `linear-gradient(150deg, ${PANEL}, #241a06)`, border: `1px solid ${GOLD}33` }}>
        <ItemImg item={item} w={64} h={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{item.n}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: GOLD, lineHeight: 1.2 }}>{item.cost}</div>
          {item.behavior && <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>{item.behavior}</div>}
        </div>
      </Panel>

      {item.desc && (
        <Panel style={{ marginTop: 8 }}>
          <Label>WHAT IT DOES</Label>
          <div style={{ fontSize: 12.5, color: CREAM, lineHeight: 1.5 }}>{item.desc}</div>
          {item.notes && item.notes !== item.desc && (
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 7, lineHeight: 1.45 }}>{item.notes}</div>
          )}
        </Panel>
      )}

      {parts.length > 0 && <ItemRow title="BUILDS FROM" items={parts} onOpen={onOpen} color={GREEN} />}
      {buildsInto.length > 0 && <ItemRow title="BUILDS INTO" items={buildsInto} onOpen={onOpen} color={GOLD} />}

      {item.lore && (
        <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5, padding: "14px 2px 18px", fontStyle: "italic" }}>{item.lore}</div>
      )}
      <div style={{ height: 10 }} />
    </Shell>
  );
}

function ItemRow({ title, items, onOpen, color }: { title: string; items: KItem[]; onOpen: (key: string) => void; color: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <Label color={color}>{title}</Label>
      <div style={{ display: "grid", gap: 4 }}>
        {items.map((i) => (
          <button key={i.k} className="dl-btn" onClick={() => onOpen(i.k)} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 10,
            background: PANEL, border: `1px solid ${LINE}`, color: CREAM, cursor: "pointer", textAlign: "left",
          }}>
            <ItemImg item={i} w={38} h={28} />
            <span style={{ flex: "1 1 auto", fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.n}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, flexShrink: 0 }}>{i.cost}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
