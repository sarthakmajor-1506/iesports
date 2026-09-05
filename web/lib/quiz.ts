/**
 * Draft Lab — quiz question bank.
 *
 * Questions are generated from `knowledge.json` rather than hand-written, so the
 * bank covers all 127 heroes and 204 items and stays correct through a patch
 * simply by rebuilding the knowledge file.
 *
 * Generation is seeded. Two players in the same live room derive the identical
 * three questions from the room code without any of it crossing the network, so
 * neither can see the other's questions early and there is nothing to sync.
 *
 * Distractors are deliberately plausible — same-attribute heroes, similarly
 * priced items, other heroes' ultimates. Random wrong answers would make every
 * question answerable by elimination and the quiz pointless.
 *
 * Art comes from the knowledge file, which HEAD-checks every URL at build time.
 * Nothing here constructs an image URL: an earlier version derived them from the
 * ability key and shipped 53 icons that 404'd. A question that needs a picture
 * only ever draws from entries whose own art was verified.
 */

export type KAbility = {
  k: string; n: string; desc: string; lore: string; behavior: string;
  dmg: string; pierces: boolean; cd: string; mc: string; ult?: boolean;
  /** Verified art, or the hero's icon when Valve publishes none (innates). */
  img: string;
  /** True when `img` is the hero icon standing in, not this ability's own art. */
  imgFallback?: boolean;
  innate?: boolean;
};
export type KHeroArt = { portrait: string | null; crop: string | null; icon: string | null; render: string | null };
export type KHeroStats = {
  str: number; agi: number; int: number; strG: number; agiG: number; intG: number;
  hp: number; mana: number; armor: number; mr: number;
  dmgMin: number; dmgMax: number; ms: number; range: number; bat: number;
  dayVision: number; nightVision: number; legs: number;
};
export type KHero = {
  id: number; name: string; base: string; attr: string; roles: string[]; atk: string;
  art: KHeroArt; stats: KHeroStats;
  pubPick: number | null; pubWin: number | null;
  abilities: KAbility[]; talents: { n: string; lvl: number }[];
};
export type KItem = {
  k: string; n: string; img: string; cost: number; qual: string; desc: string; notes: string;
  components: string[] | null; neutral: boolean; tier: number | null; behavior: string; lore: string;
};
export type Knowledge = { builtAt: string; patch: string; version?: number; cdn: string; heroes: KHero[]; items: KItem[] };

export type QuizOption = { label: string; img?: string; correct: boolean };
export type Question = {
  kind: "ability-hero" | "hero-ult" | "item-cost" | "item-recipe" | "ability-name" | "ability-effect";
  prompt: string;
  hint?: string;
  img?: string;
  imgShape: "square" | "wide" | "none";
  options: QuizOption[];
  explain: string;
};

/** Look-ups by key, for callers that hold a key rather than the object. */
export const abilityByKey = (k: Knowledge, key: string) => {
  for (const h of k.heroes) for (const a of h.abilities) if (a.k === key) return a;
  return null;
};
export const itemByKey = (k: Knowledge, key: string) => k.items.find((i) => i.k === key) ?? null;

/** Best still image for a hero, in the order the UI should prefer it. */
export const heroStill = (h: KHero) => h.art.portrait ?? h.art.crop ?? h.art.icon ?? "";

/** Deterministic PRNG so a seed always yields the same paper. */
function rng(seedStr: string) {
  let a = 0;
  for (let i = 0; i < seedStr.length; i++) a = (Math.imul(a, 31) + seedStr.charCodeAt(i)) >>> 0;
  a = (a ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];
function sample<T>(arr: T[], n: number, r: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
function shuffle<T>(arr: T[], r: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Abilities distinctive enough to be a fair question.
 *
 * `art: true` additionally requires the ability to own its icon. Innates borrow
 * the hero's icon, which would make "whose ability is this?" answerable from the
 * picture alone — and every innate would look like a different question with the
 * same give-away.
 */
function quizableAbilities(k: Knowledge, art: boolean) {
  const seen = new Map<string, number>();
  for (const h of k.heroes) for (const a of h.abilities) seen.set(a.n, (seen.get(a.n) ?? 0) + 1);
  const out: { hero: KHero; ab: KAbility }[] = [];
  for (const h of k.heroes) {
    for (const a of h.abilities) {
      // Skip names shared across heroes, and the very short generic ones.
      if ((seen.get(a.n) ?? 0) > 1) continue;
      if (a.n.length < 4) continue;
      if (art && (!a.img || a.imgFallback)) continue;
      out.push({ hero: h, ab: a });
    }
  }
  return out;
}

/* --------------------------------------------------------------- builders */

function qAbilityHero(k: Knowledge, r: () => number): Question | null {
  const pool = quizableAbilities(k, true);
  const { hero, ab } = pick(pool, r);
  const others = sample(k.heroes.filter((h) => h.id !== hero.id && h.attr === hero.attr), 3, r);
  if (others.length < 3) return null;
  return {
    kind: "ability-hero",
    prompt: "Whose ability is this?",
    hint: ab.n,
    img: ab.img,
    imgShape: "square",
    options: shuffle(
      [{ label: hero.name, correct: true }, ...others.map((h) => ({ label: h.name, correct: false }))],
      r
    ),
    explain: `${ab.n} belongs to ${hero.name}.`,
  };
}

function qHeroUlt(k: Knowledge, r: () => number): Question | null {
  const ultOf = (h: KHero) => h.abilities.find((a) => a.ult && a.img && !a.imgFallback);
  const withUlt = k.heroes.filter((h) => ultOf(h));
  const hero = pick(withUlt, r);
  const ult = ultOf(hero)!;
  const decoys = sample(withUlt.filter((h) => h.id !== hero.id).map((h) => ultOf(h)!), 3, r);
  if (decoys.length < 3) return null;
  return {
    kind: "hero-ult",
    prompt: `Which is ${hero.name}'s ultimate?`,
    img: undefined,
    imgShape: "none",
    options: shuffle(
      [
        { label: ult.n, img: ult.img, correct: true },
        ...decoys.map((d) => ({ label: d.n, img: d.img, correct: false })),
      ],
      r
    ),
    explain: `${hero.name}'s ultimate is ${ult.n}.`,
  };
}

function qItemCost(k: Knowledge, r: () => number): Question | null {
  const pool = k.items.filter((i) => !i.neutral && i.cost >= 500 && i.img);
  const item = pick(pool, r);
  // Nearby prices, so the answer cannot be spotted as the odd number out.
  const near = pool
    .filter((i) => i.k !== item.k && Math.abs(i.cost - item.cost) < Math.max(700, item.cost * 0.45))
    .map((i) => i.cost);
  const decoys = [...new Set(near)].filter((c) => c !== item.cost);
  const chosen = sample(decoys, 3, r);
  if (chosen.length < 3) return null;
  return {
    kind: "item-cost",
    prompt: "What does this item cost?",
    hint: item.n,
    img: item.img,
    imgShape: "wide",
    options: shuffle(
      [{ label: `${item.cost}`, correct: true }, ...chosen.map((c) => ({ label: `${c}`, correct: false }))],
      r
    ),
    explain: `${item.n} costs ${item.cost} gold.`,
  };
}

function qItemRecipe(k: Knowledge, r: () => number): Question | null {
  const byKey = new Map(k.items.map((i) => [i.k, i]));
  const pool = k.items.filter(
    (i) => i.img && i.components && i.components.length >= 2 && i.components.some((c) => byKey.get(c)?.img)
  );
  const item = pick(pool, r);
  const parts = item.components!.filter((c) => byKey.get(c)?.img);
  if (!parts.length) return null;
  const part = byKey.get(pick(parts, r))!;
  // Two item keys can share a display name (Disperser's recipe reaches Diffusal
  // Blade under two of them), which would put the correct answer on screen twice.
  const decoys = sample(
    k.items.filter(
      (i) => i.img && !i.neutral && !item.components!.includes(i.k) && i.k !== item.k
        && i.n !== part.n && i.n !== item.n && Math.abs(i.cost - part.cost) < 1400
    ),
    3, r
  );
  if (new Set(decoys.map((d) => d.n)).size !== decoys.length) return null;
  if (decoys.length < 3) return null;
  return {
    kind: "item-recipe",
    prompt: `Which item builds into ${item.n}?`,
    img: item.img,
    imgShape: "wide",
    options: shuffle(
      [
        { label: part.n, img: part.img, correct: true },
        ...decoys.map((d) => ({ label: d.n, img: d.img, correct: false })),
      ],
      r
    ),
    explain: `${part.n} is one of ${item.n}'s components.`,
  };
}

function qAbilityName(k: Knowledge, r: () => number): Question | null {
  const pool = quizableAbilities(k, true);
  const { hero, ab } = pick(pool, r);
  // Decoys from the same attribute pool keeps the flavour of the names similar.
  const decoys = sample(
    pool.filter((p) => p.hero.id !== hero.id && p.hero.attr === hero.attr).map((p) => p.ab),
    3, r
  );
  if (decoys.length < 3) return null;
  return {
    kind: "ability-name",
    prompt: "What is this ability called?",
    hint: hero.name,
    img: ab.img,
    imgShape: "square",
    options: shuffle(
      [{ label: ab.n, correct: true }, ...decoys.map((d) => ({ label: d.n, correct: false }))],
      r
    ),
    explain: `This is ${ab.n}, from ${hero.name}.`,
  };
}

/**
 * What an ability does, asked in words.
 *
 * The only question type that does not lean on the icon, which is what lets
 * innates — a real and often-missed part of the current patch — be asked about
 * at all, since Valve publishes no icons for them.
 */
function qAbilityEffect(k: Knowledge, r: () => number): Question | null {
  const pool = quizableAbilities(k, false).filter(
    (p) => p.ab.desc.length > 40 && p.ab.desc.length < 240 && !p.ab.desc.includes(p.ab.n)
  );
  if (pool.length < 20) return null;
  const { hero, ab } = pick(pool, r);
  const decoys = sample(pool.filter((p) => p.hero.id !== hero.id).map((p) => p.ab), 3, r);
  if (decoys.length < 3) return null;
  return {
    kind: "ability-effect",
    prompt: ab.desc,
    hint: ab.innate ? `${hero.name}'s innate` : "Which ability is this?",
    img: undefined,
    imgShape: "none",
    options: shuffle(
      [{ label: ab.n, correct: true }, ...decoys.map((d) => ({ label: d.n, correct: false }))],
      r
    ),
    explain: `That is ${ab.n}${ab.innate ? ", an innate" : ""} — ${hero.name}.`,
  };
}

const BUILDERS = [qAbilityHero, qHeroUlt, qItemCost, qItemRecipe, qAbilityName, qAbilityEffect];

/**
 * `count` questions for a given seed, with no two of the same kind, so a round
 * always mixes hero knowledge with item knowledge.
 */
export function buildQuiz(k: Knowledge, seed: string, count = 3): Question[] {
  const r = rng(seed);
  const kinds = shuffle(BUILDERS, r);
  const out: Question[] = [];
  let cursor = 0, guard = 0;
  while (out.length < count && guard < 80) {
    guard++;
    const build = kinds[cursor % kinds.length];
    cursor++;
    const q = build(k, r);
    if (q && !out.some((o) => o.prompt === q.prompt || o.kind === q.kind)) out.push(q);
  }
  return out;
}

export const QUIZ_SECONDS = 10;
export const MAX_POINTS = 10;

/**
 * Points are the seconds you had left, so an instant correct answer is worth the
 * full 10 and a slow one is worth what the clock says. Wrong or unanswered is 0 —
 * there is no partial credit for guessing late.
 */
export function scoreAnswer(correct: boolean, msLeft: number): number {
  if (!correct) return 0;
  return Math.max(0, Math.min(MAX_POINTS, Math.ceil(msLeft / 1000)));
}
