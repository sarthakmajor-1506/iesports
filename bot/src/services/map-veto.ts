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

export interface VetoState {
  status: "toss_choice" | "veto" | "random" | "complete";
  bo: number;
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

    for (const pick of picks) {
      const sidePicker = otherTeam(pick.team);
      mapLines.push(
        `**Game ${gameNum}:** 🗺️ ${pick.map}`,
        `   └ Map picked by **${tName(state, pick.team)}** · **${tName(state, sidePicker)}** picks attack/defence`,
      );
      gameNum++;
    }

    // Decider (remaining map after all picks + bans are exhausted)
    if (state.remainingMaps.length === 1) {
      const decider = state.remainingMaps[0];
      const sidePicker = state.sidePickOnDecider || state.tossWinner;
      if (state.bo === 1) {
        mapLines.push(
          `**Map:** 🗺️ ${decider}`,
          `   └ **${tName(state, sidePicker)}** picks attack/defence (last map standing)`,
        );
      } else {
        mapLines.push(
          `**Game ${gameNum}:** 🗺️ ${decider}  *(decider)*`,
          `   └ **${tName(state, sidePicker)}** picks attack/defence`,
        );
      }
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

  // Only toss-winner captain may choose
  if (interaction.user.id !== captainId(state, state.tossWinner)) {
    await interaction.followUp({
      content: `❌ Only the **${tName(state, state.tossWinner)}** captain can choose.`,
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
  if (interaction.user.id !== captainId(state, actor)) {
    await interaction.followUp({
      content: `❌ It's **${tName(state, actor)}**'s turn to reveal.`,
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
    state.status = "complete";
    await setVetoState(tournamentId, matchId, state);
    await interaction.editReply({
      embeds: [buildVetoEmbed(state)],
      components: [],
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

  // Only the active captain may act
  if (interaction.user.id !== captainId(state, step.team)) {
    await interaction.followUp({
      content: `❌ It's **${tName(state, step.team)}**'s turn.`,
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

  // Check completion
  const sequence = VETO_SEQUENCES[state.bo];
  if (state.currentStep >= sequence.length || state.remainingMaps.length <= 1) {
    state.status = "complete";
  }

  await setVetoState(tournamentId, matchId, state);

  if (state.status === "complete") {
    await interaction.editReply({ embeds: [buildVetoEmbed(state)], components: [] });
  } else {
    await interaction.editReply({
      embeds: [buildVetoEmbed(state)],
      components: buildMapButtons(state, tournamentId, matchId),
    });
  }
}
