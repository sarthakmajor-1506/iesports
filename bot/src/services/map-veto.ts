import {
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from "discord.js";
import { getDb } from "./firebase";

// ── Valorant Competitive Map Pool ────────────────────────────────
export const VALORANT_MAPS = [
  "Abyss", "Ascent", "Bind", "Haven", "Icebox", "Lotus", "Split",
];

// ── Veto Sequences ───────────────────────────────────────────────
// "first" = team that bans first, "second" = other team
type VetoStep = { actor: "first" | "second"; action: "ban" | "pick" };

const VETO_SEQUENCES: Record<number, VetoStep[]> = {
  1: [
    // BO1: 6 bans, last map standing
    { actor: "first", action: "ban" }, { actor: "second", action: "ban" },
    { actor: "first", action: "ban" }, { actor: "second", action: "ban" },
    { actor: "first", action: "ban" }, { actor: "second", action: "ban" },
  ],
  2: [
    // BO2: ban-ban-pick-pick — each team bans one then picks one.
    // 1-1 is an accepted BO2 result, so there is no decider.
    { actor: "first", action: "ban" },  { actor: "second", action: "ban" },
    { actor: "first", action: "pick" }, { actor: "second", action: "pick" },
  ],
  3: [
    // BO3: ban-ban-pick-pick-ban-ban, decider remains
    { actor: "first", action: "ban" },  { actor: "second", action: "ban" },
    { actor: "first", action: "pick" }, { actor: "second", action: "pick" },
    { actor: "first", action: "ban" },  { actor: "second", action: "ban" },
  ],
  5: [
    // BO5: ban-ban-pick-pick-pick-pick, decider remains
    { actor: "first", action: "ban" },  { actor: "second", action: "ban" },
    { actor: "first", action: "pick" }, { actor: "second", action: "pick" },
    { actor: "first", action: "pick" }, { actor: "second", action: "pick" },
  ],
};

// ── Veto State (stored on Firestore match doc as `vetoState`) ───
export interface VetoAction {
  team: "team1" | "team2";
  action: "ban" | "pick";
  map: string;
}

export interface SideAction {
  map: string;
  sidePicker: "team1" | "team2";
  side: "attack" | "defence" | null;
}

export interface VetoState {
  status: "toss_choice" | "veto" | "random" | "side_pick" | "complete";
  bo: number;
  /** Populated when veto/random finishes. Each entry is one map in game
   * order, the captain who gets side pick, and their choice (null until
   * they've clicked). */
  sideActions?: SideAction[];
  sideStep?: number;
  tossWinner: "team1" | "team2";
  banFirst: "team1" | "team2" | null;
  sidePickOnDecider: "team1" | "team2" | null;
  currentStep: number;
  actions: VetoAction[];
  remainingMaps: string[];
  team1Name: string;
  team2Name: string;
  team1CaptainDiscordId: string;
  team2CaptainDiscordId: string;
  /** Every teammate's Discord ID. Any member of a team may click that
   * team's veto/random/side buttons — not just the captain. Optional
   * for back-compat with veto records created before this field existed. */
  team1MemberDiscordIds?: string[];
  team2MemberDiscordIds?: string[];
  channelId: string;
  messageId: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function otherTeam(team: "team1" | "team2"): "team1" | "team2" {
  return team === "team1" ? "team2" : "team1";
}

function getMatchRef(tournamentId: string, matchId: string) {
  return getDb()
    .collection("valorantTournaments").doc(tournamentId)
    .collection("matches").doc(matchId);
}

async function getVetoState(tournamentId: string, matchId: string): Promise<VetoState | null> {
  const doc = await getMatchRef(tournamentId, matchId).get();
  return doc.data()?.vetoState || null;
}

async function setVetoState(tournamentId: string, matchId: string, state: VetoState): Promise<void> {
  await getMatchRef(tournamentId, matchId).update({ vetoState: state });
}

function getCurrentStep(state: VetoState): { team: "team1" | "team2"; action: "ban" | "pick" } | null {
  const sequence = VETO_SEQUENCES[state.bo];
  if (!sequence || state.currentStep >= sequence.length) return null;
  const step = sequence[state.currentStep];
  const team = step.actor === "first" ? state.banFirst! : otherTeam(state.banFirst!);
  return { team, action: step.action };
}

function tName(state: VetoState, team: "team1" | "team2"): string {
  return team === "team1" ? state.team1Name : state.team2Name;
}

function captainId(state: VetoState, team: "team1" | "team2"): string {
  return team === "team1" ? state.team1CaptainDiscordId : state.team2CaptainDiscordId;
}

/** Any registered member of the given team may act (captain or not).
 * Falls back to the captain ID alone on older veto records that don't
 * carry the member arrays. */
function isTeamMember(state: VetoState, team: "team1" | "team2", userId: string): boolean {
  if (userId === captainId(state, team)) return true;
  const list = team === "team1" ? state.team1MemberDiscordIds : state.team2MemberDiscordIds;
  return !!list && list.includes(userId);
}

/** Build the ordered list of (map, sidePicker) entries that need an
 * attack/defence decision once veto/random has finished selecting maps.
 * Picks use "other team picks side"; the decider (veto BO3/5) uses the
 * team that won toss-side-pick privilege.
 */
function computeSideActions(state: VetoState): SideAction[] {
  const actions: SideAction[] = [];
  for (const a of state.actions) {
    if (a.action !== "pick") continue;
    actions.push({ map: a.map, sidePicker: otherTeam(a.team), side: null });
  }
  // Decider (veto only): one map remains in the pool after all bans+picks.
  if (state.status !== "random" && state.remainingMaps.length === 1) {
    const decider = state.remainingMaps[0];
    const sidePicker = state.sidePickOnDecider || state.tossWinner;
    actions.push({ map: decider, sidePicker, side: null });
  }
  return actions;
}

function buildSidePickEmbed(state: VetoState): EmbedBuilder {
  const sideActions = state.sideActions || [];
  const step = state.sideStep ?? 0;
  const current = sideActions[step];
  const lines: string[] = [
    `**${state.team1Name}** vs **${state.team2Name}**`,
    `🏆 Toss: **${tName(state, state.tossWinner)}**`,
    "",
  ];
  sideActions.forEach((sa, i) => {
    const label = `**Game ${i + 1}:** 🗺️ ${sa.map}`;
    if (sa.side) {
      lines.push(`${label}  ✅`);
      lines.push(`   └ **${tName(state, sa.sidePicker)}** starts on **${sa.side}**`);
    } else if (i === step) {
      lines.push(`${label}  ◀️ **now choosing**`);
      lines.push(`   └ **${tName(state, sa.sidePicker)}** captain — pick your starting side below`);
    } else {
      lines.push(label);
      lines.push(`   └ **${tName(state, sa.sidePicker)}** will pick side`);
    }
  });

  return new EmbedBuilder()
    .setTitle(`🎯 SIDE SELECTION — BO${state.bo}`)
    .setDescription(lines.join("\n"))
    .setColor(0xff4655)
    .setFooter({ text: current ? `Only ${tName(state, current.sidePicker)} captain can choose` : `BO${state.bo} · IEsports Tournament` });
}

function buildSidePickRow(
  state: VetoState,
  tournamentId: string,
  matchId: string,
): ActionRowBuilder<ButtonBuilder> {
  const step = state.sideStep ?? 0;
  const current = (state.sideActions || [])[step];
  const teamName = current ? tName(state, current.sidePicker) : "";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`side_pick:${tournamentId}:${matchId}:attack`)
      .setLabel(`${teamName} — Attack`)
      .setEmoji({ name: "⚔️" })
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`side_pick:${tournamentId}:${matchId}:defence`)
      .setLabel(`${teamName} — Defence`)
      .setEmoji({ name: "🛡️" })
      .setStyle(ButtonStyle.Primary),
  );
}

// ── Embed Builders ──────────────────────────────────────────────

function buildVetoEmbed(state: VetoState): EmbedBuilder {
  const tossLine = `🏆 Toss: **${tName(state, state.tossWinner)}**`;
  const matchLine = `**${state.team1Name}** vs **${state.team2Name}**`;

  // ── Complete ──
  if (state.status === "complete") {
    const picks = state.actions.filter(a => a.action === "pick");
    const bans = state.actions.filter(a => a.action === "ban");
    const mapLines: string[] = [];
    let gameNum = 1;
    // Look up side pick (if captains have already chosen) by map name
    const sideByMap: Record<string, SideAction | undefined> = {};
    for (const sa of state.sideActions || []) sideByMap[sa.map] = sa;

    const sideLine = (sa: SideAction | undefined, pickerTeam: "team1" | "team2" | null, fallbackSidePicker?: "team1" | "team2") => {
      const mapPickerName = pickerTeam ? tName(state, pickerTeam) : null;
      const sp = sa?.sidePicker || fallbackSidePicker;
      const spName = sp ? tName(state, sp) : "";
      if (sa?.side) {
        const defender = sp!;
        const attacker = otherTeam(defender);
        const firstTeam = sa.side === "attack" ? defender : attacker;
        const sideWord = sa.side === "attack" ? "attack" : "defence";
        if (mapPickerName) {
          return `   └ Picked by **${mapPickerName}** · **${tName(state, firstTeam)}** starts on **${sideWord}**`;
        }
        return `   └ **${tName(state, firstTeam)}** starts on **${sideWord}**`;
      }
      return mapPickerName
        ? `   └ Picked by **${mapPickerName}** · **${spName}** picks attack/defence`
        : `   └ **${spName}** picks attack/defence`;
    };

    for (const pick of picks) {
      mapLines.push(`**Game ${gameNum}:** 🗺️ ${pick.map}`);
      mapLines.push(sideLine(sideByMap[pick.map], pick.team));
      gameNum++;
    }

    // Decider (remaining map after all picks + bans are exhausted)
    if (state.remainingMaps.length === 1) {
      const decider = state.remainingMaps[0];
      const fallback = state.sidePickOnDecider || state.tossWinner;
      const label = state.bo === 1 ? `**Map:** 🗺️ ${decider}` : `**Game ${gameNum}:** 🗺️ ${decider}  *(decider)*`;
      mapLines.push(label);
      mapLines.push(sideLine(sideByMap[decider], null, fallback));
    }

    const banStr = bans.length > 0
      ? `\n\n**Bans in order:** ${bans.map(b => `~~${b.map}~~ *(${tName(state, b.team)})*`).join(" · ")}`
      : "";

    const advantageNote = state.banFirst
      ? `\n\n🎯 **${tName(state, state.banFirst)}** banned first · **${tName(state, state.sidePickOnDecider || otherTeam(state.banFirst))}** had side pick on decider`
      : "";

    return new EmbedBuilder()
      .setTitle("✅ MAP VETO COMPLETE")
      .setDescription([matchLine, tossLine, "", mapLines.join("\n") + banStr + advantageNote].join("\n"))
      .setColor(0x16a34a)
      .setFooter({ text: `BO${state.bo} · IEsports Tournament` });
  }

  // ── In progress ──
  const step = getCurrentStep(state);
  const currentName = step ? tName(state, step.team) : "";
  const actionVerb = step?.action === "ban" ? "ban a map" : "pick a map";
  const actionEmoji = step?.action === "ban" ? "❌" : "✅";

  const sequence = VETO_SEQUENCES[state.bo] || [];
  const stepOf = sequence.length > 0 ? `Step ${state.currentStep + 1} of ${sequence.length}` : "";
  const banFirstLine = state.banFirst
    ? `🎯 Banning first: **${tName(state, state.banFirst)}**${state.sidePickOnDecider ? ` · Side pick on decider: **${tName(state, state.sidePickOnDecider)}**` : ""}`
    : "";

  const historyLines = state.actions.map(a => {
    const emoji = a.action === "ban" ? "❌" : "✅";
    return `${emoji} ${tName(state, a.team)} ${a.action === "ban" ? "banned" : "picked"} **${a.map}**`;
  });

  const remainingLine = state.remainingMaps.length > 0
    ? `\n**Maps still available:** ${state.remainingMaps.join(" · ")}`
    : "";

  const desc = [
    matchLine,
    tossLine,
    banFirstLine,
    stepOf ? `📍 ${stepOf}` : "",
    "",
    `▶️ **${currentName}**, it's your turn to ${actionEmoji} **${actionVerb}**.`,
    historyLines.length > 0 ? "\n**History:**" : "",
    ...historyLines,
    remainingLine,
  ].filter(Boolean).join("\n");

  return new EmbedBuilder()
    .setTitle(`🗺️ MAP VETO — BO${state.bo}`)
    .setDescription(desc)
    .setColor(0xff4655)
    .setFooter({ text: `Only ${currentName} captain can ${step?.action || "act"}` });
}

function buildMapButtons(
  state: VetoState,
  tournamentId: string,
  matchId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < VALORANT_MAPS.length; i++) {
    const map = VALORANT_MAPS[i];
    const pastAction = state.actions.find(a => a.map === map);

    let style = ButtonStyle.Secondary;
    let disabled = false;
    let label = map;

    if (pastAction) {
      disabled = true;
      if (pastAction.action === "ban") {
        style = ButtonStyle.Danger;
        label = `${map} ✕`;
      } else {
        style = ButtonStyle.Success;
        label = `${map} ✓`;
      }
    }

    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`veto_map:${tournamentId}:${matchId}:${i}`)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled),
    );

    // 4 buttons per row → 7 maps = row of 4 + row of 3
    if (currentRow.components.length === 4 || i === VALORANT_MAPS.length - 1) {
      rows.push(currentRow);
      if (i < VALORANT_MAPS.length - 1) {
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }
  }

  return rows;
}

// ── Interaction Handlers ────────────────────────────────────────

export async function handleTossChoice(
  interaction: ButtonInteraction,
  tournamentId: string,
  matchId: string,
  choice: string,
): Promise<void> {
  await interaction.deferUpdate();

  const state = await getVetoState(tournamentId, matchId);
  if (!state || state.status !== "toss_choice") {
    await interaction.followUp({ content: "❌ No active toss for this match.", ephemeral: true });
    return;
  }

  // Any member of the toss-winner team may choose (captain or teammate).
  if (!isTeamMember(state, state.tossWinner, interaction.user.id)) {
    await interaction.followUp({
      content: `❌ Only **${tName(state, state.tossWinner)}** players can choose.`,
      ephemeral: true,
    });
    return;
  }

  if (choice === "random") {
    // Random-maps mode: toss winner clicks first, then the other team. Each
    // click reveals one random map. No bans, no decider. Total picks = bo.
    state.status = "random";
    state.currentStep = 0;
    state.banFirst = null;
    state.sidePickOnDecider = state.tossWinner; // first reveal = toss winner
    await setVetoState(tournamentId, matchId, state);

    await interaction.editReply({
      embeds: [buildRandomEmbed(state)],
      components: [buildRandomRevealRow(state, tournamentId, matchId)],
    });
    return;
  }

  if (choice === "ban_first") {
    state.banFirst = state.tossWinner;
    state.sidePickOnDecider = otherTeam(state.tossWinner);
  } else {
    // side_first: other team bans first, toss winner picks side on decider
    state.banFirst = otherTeam(state.tossWinner);
    state.sidePickOnDecider = state.tossWinner;
  }

  state.status = "veto";
  state.currentStep = 0;
  await setVetoState(tournamentId, matchId, state);

  await interaction.editReply({
    embeds: [buildVetoEmbed(state)],
    components: buildMapButtons(state, tournamentId, matchId),
  });
}

// ── Random map flow ────────────────────────────────────────────────
// Whose turn is it to click? Toss winner goes first; each click advances.
function getRandomActor(state: VetoState): "team1" | "team2" {
  return state.currentStep % 2 === 0 ? state.tossWinner : otherTeam(state.tossWinner);
}

function buildRandomEmbed(state: VetoState): EmbedBuilder {
  const picks = state.actions.filter((a) => a.action === "pick");
  const totalPicks = state.bo;
  const remainingReveals = totalPicks - picks.length;
  const actor = getRandomActor(state);
  const tossLine = `🏆 Toss: **${tName(state, state.tossWinner)}**`;
  const matchLine = `**${state.team1Name}** vs **${state.team2Name}**`;

  const mapLines: string[] = picks.map((p, i) => {
    const sidePicker = otherTeam(p.team);
    return [
      `**Game ${i + 1}:** 🗺️ ${p.map}`,
      `   └ Revealed by **${tName(state, p.team)}** · **${tName(state, sidePicker)}** picks attack/defence`,
    ].join("\n");
  });

  const desc = [
    matchLine,
    tossLine,
    `🎲 Mode: **Random Maps** · ${totalPicks} total`,
    "",
    picks.length === 0 ? "*No maps revealed yet.*" : "**Revealed maps:**",
    ...mapLines,
    "",
    remainingReveals > 0
      ? `▶️ **${tName(state, actor)}** captain — click below to reveal the next map (${remainingReveals} remaining).`
      : `✅ All ${totalPicks} maps revealed. Good luck!`,
  ].filter(Boolean).join("\n");

  return new EmbedBuilder()
    .setTitle(`🎲 RANDOM MAPS — BO${state.bo}`)
    .setDescription(desc)
    .setColor(0x22c55e)
    .setFooter({ text: remainingReveals > 0 ? `Only ${tName(state, actor)} captain can click next` : `BO${state.bo} · IEsports Tournament` });
}

function buildRandomRevealRow(
  state: VetoState,
  tournamentId: string,
  matchId: string,
): ActionRowBuilder<ButtonBuilder> {
  const actor = getRandomActor(state);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`random_reveal:${tournamentId}:${matchId}`)
      .setLabel(`${tName(state, actor)} — Reveal My Map`)
      .setEmoji({ name: "🎲" })
      .setStyle(ButtonStyle.Success),
  );
}

export async function handleRandomReveal(
  interaction: ButtonInteraction,
  tournamentId: string,
  matchId: string,
): Promise<void> {
  await interaction.deferUpdate();

  const state = await getVetoState(tournamentId, matchId);
  if (!state || state.status !== "random") {
    await interaction.followUp({ content: "❌ No active random-maps session.", ephemeral: true });
    return;
  }

  const actor = getRandomActor(state);
  if (!isTeamMember(state, actor, interaction.user.id)) {
    await interaction.followUp({
      content: `❌ It's **${tName(state, actor)}**'s turn to reveal — any player on that team can click.`,
      ephemeral: true,
    });
    return;
  }

  if (state.remainingMaps.length === 0) {
    await interaction.followUp({ content: "❌ No maps left to reveal.", ephemeral: true });
    return;
  }

  // Pick one at random
  const idx = Math.floor(Math.random() * state.remainingMaps.length);
  const chosen = state.remainingMaps[idx];
  state.actions.push({ team: actor, action: "pick", map: chosen });
  state.remainingMaps = state.remainingMaps.filter((m) => m !== chosen);
  state.currentStep++;

  const totalPicks = state.bo;
  const picksSoFar = state.actions.filter((a) => a.action === "pick").length;
  const done = picksSoFar >= totalPicks;

  if (done) {
    // Random flow has no decider, so side pickers are just the other team
    // for each revealed map. Hand off to the shared side-pick phase.
    state.sideActions = computeSideActions(state);
    state.sideStep = 0;
    state.status = "side_pick";
    await setVetoState(tournamentId, matchId, state);
    await interaction.editReply({
      embeds: [buildSidePickEmbed(state)],
      components: [buildSidePickRow(state, tournamentId, matchId)],
    });
    return;
  }

  await setVetoState(tournamentId, matchId, state);
  await interaction.editReply({
    embeds: [buildRandomEmbed(state)],
    components: [buildRandomRevealRow(state, tournamentId, matchId)],
  });
}

export async function handleVetoMap(
  interaction: ButtonInteraction,
  tournamentId: string,
  matchId: string,
  mapIndex: number,
): Promise<void> {
  await interaction.deferUpdate();

  const state = await getVetoState(tournamentId, matchId);
  if (!state || state.status !== "veto") {
    await interaction.followUp({ content: "❌ No active veto for this match.", ephemeral: true });
    return;
  }

  const step = getCurrentStep(state);
  if (!step) {
    await interaction.followUp({ content: "❌ Veto sequence error.", ephemeral: true });
    return;
  }

  // Any member of the active team may act.
  if (!isTeamMember(state, step.team, interaction.user.id)) {
    await interaction.followUp({
      content: `❌ It's **${tName(state, step.team)}**'s turn — any player on that team can click.`,
      ephemeral: true,
    });
    return;
  }

  const map = VALORANT_MAPS[mapIndex];
  if (!map || !state.remainingMaps.includes(map)) {
    await interaction.followUp({ content: "❌ Map not available.", ephemeral: true });
    return;
  }

  // Record action
  state.actions.push({ team: step.team, action: step.action, map });
  state.remainingMaps = state.remainingMaps.filter(m => m !== map);
  state.currentStep++;

  // Check completion — when picks/bans are exhausted, transition to the
  // side-pick phase so captains can choose attack/defence before the
  // veto record is fully locked.
  const sequence = VETO_SEQUENCES[state.bo];
  const veto_done = state.currentStep >= sequence.length || state.remainingMaps.length <= 1;
  if (veto_done) {
    state.sideActions = computeSideActions(state);
    state.sideStep = 0;
    state.status = "side_pick";
  }

  await setVetoState(tournamentId, matchId, state);

  if (state.status === "side_pick") {
    await interaction.editReply({
      embeds: [buildSidePickEmbed(state)],
      components: [buildSidePickRow(state, tournamentId, matchId)],
    });
  } else {
    await interaction.editReply({
      embeds: [buildVetoEmbed(state)],
      components: buildMapButtons(state, tournamentId, matchId),
    });
  }
}

export async function handleSidePick(
  interaction: ButtonInteraction,
  tournamentId: string,
  matchId: string,
  side: string,
): Promise<void> {
  await interaction.deferUpdate();

  const state = await getVetoState(tournamentId, matchId);
  if (!state || state.status !== "side_pick") {
    await interaction.followUp({ content: "❌ No active side-pick session.", ephemeral: true });
    return;
  }
  if (side !== "attack" && side !== "defence") {
    await interaction.followUp({ content: "❌ Invalid side.", ephemeral: true });
    return;
  }

  const sideActions = state.sideActions || [];
  const step = state.sideStep ?? 0;
  const current = sideActions[step];
  if (!current) {
    await interaction.followUp({ content: "❌ Side selection already complete.", ephemeral: true });
    return;
  }

  if (!isTeamMember(state, current.sidePicker, interaction.user.id)) {
    await interaction.followUp({
      content: `❌ Only **${tName(state, current.sidePicker)}** players can pick side for **${current.map}**.`,
      ephemeral: true,
    });
    return;
  }

  current.side = side;
  state.sideActions = sideActions;
  state.sideStep = step + 1;

  const done = state.sideStep >= sideActions.length;
  if (done) state.status = "complete";

  await setVetoState(tournamentId, matchId, state);

  if (done) {
    await interaction.editReply({ embeds: [buildVetoEmbed(state)], components: [] });
  } else {
    await interaction.editReply({
      embeds: [buildSidePickEmbed(state)],
      components: [buildSidePickRow(state, tournamentId, matchId)],
    });
  }
}
