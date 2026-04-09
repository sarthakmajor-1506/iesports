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
  status: "toss_choice" | "veto" | "complete";
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
  // ── Complete ──
  if (state.status === "complete") {
    const picks = state.actions.filter(a => a.action === "pick");
    const bans = state.actions.filter(a => a.action === "ban");
    const mapLines: string[] = [];
    let gameNum = 1;

    for (const pick of picks) {
      const sidePicker = otherTeam(pick.team);
      mapLines.push(
        `🗺️ **Game ${gameNum}:** ${pick.map} — *${tName(state, pick.team)} pick* · ${tName(state, sidePicker)} picks side`
      );
      gameNum++;
    }

    // Decider (remaining map)
    if (state.remainingMaps.length === 1) {
      const decider = state.remainingMaps[0];
      const sidePicker = state.sidePickOnDecider || state.tossWinner;
      if (state.bo === 1) {
        mapLines.push(`🗺️ **Map:** ${decider} — ${tName(state, sidePicker)} picks side`);
      } else {
        mapLines.push(
          `🗺️ **Game ${gameNum}:** ${decider} — *decider* · ${tName(state, sidePicker)} picks side`
        );
      }
    }

    const banStr = bans.length > 0
      ? `\n\n**Bans:** ${bans.map(b => `~~${b.map}~~ (${tName(state, b.team)})`).join(" · ")}`
      : "";

    return new EmbedBuilder()
      .setTitle("✅ MAP VETO COMPLETE")
      .setDescription(mapLines.join("\n") + banStr)
      .setColor(0x16a34a)
      .setFooter({ text: `BO${state.bo} · IEsports Tournament` });
  }

  // ── In progress ──
  const step = getCurrentStep(state);
  const currentName = step ? tName(state, step.team) : "";
  const actionLabel = step?.action === "ban" ? "BAN" : "PICK";

  const historyLines = state.actions.map(a => {
    const emoji = a.action === "ban" ? "❌" : "✅";
    return `${emoji} ${tName(state, a.team)} ${a.action === "ban" ? "banned" : "picked"} **${a.map}**`;
  });

  const desc = [
    `**${currentName}**'s turn to **${actionLabel}**`,
    "",
    ...(historyLines.length > 0 ? historyLines : []),
  ].join("\n");

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
