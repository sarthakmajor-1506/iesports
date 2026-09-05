/**
 * Draft — the turn order, shared between solo and live.
 *
 * Solo (vs The Counterpicker) and live (vs a friend) used to each hand-roll
 * their own ten-pick and sixteen-step sequences. Adding bans to live meant
 * duplicating the sequence again with a second chance to drift from solo's —
 * exactly the class of bug this codebase has been bitten by before (see the
 * silent-field-drop history in memory). One generator now, parameterised by
 * `role` rather than "bot"/"you" or "host"/"guest", so each caller maps role 0
 * and role 1 onto whatever it calls its two sides.
 */

export type SeqRole = 0 | 1;
export type SeqStep = { role: SeqRole; kind: "pick" | "ban" };

/** Ten alternating picks, role 0 opens. */
function noBans(): SeqStep[] {
  return Array.from({ length: 10 }, (_, i) => ({ role: (i % 2) as SeqRole, kind: "pick" }));
}

/** Three bans each across two phases, snake picks, role 0 opens every phase. */
function withBans(): SeqStep[] {
  const s = (role: SeqRole, kind: SeqStep["kind"]): SeqStep => ({ role, kind });
  return [
    s(0, "ban"), s(1, "ban"), s(0, "ban"), s(1, "ban"),
    s(0, "pick"), s(1, "pick"), s(1, "pick"), s(0, "pick"),
    s(0, "ban"), s(1, "ban"),
    s(0, "pick"), s(1, "pick"), s(1, "pick"), s(0, "pick"),
    s(0, "pick"), s(1, "pick"),
  ];
}

export function draftSequence(bans: boolean): SeqStep[] {
  return bans ? withBans() : noBans();
}

export const picksPerSide = 5;
