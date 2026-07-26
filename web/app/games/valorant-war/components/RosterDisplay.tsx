'use client';
import { COLORS } from '../data/colors';
import { getAgent } from '../data/agents';
import { getWeapon } from '../data/weapons';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import type { TeamState, Side } from '../data/types';

interface Props {
  team: TeamState;
  side: Side;
  selectedSlot?: number | null;
  onSelectSlot?: (idx: number) => void;
}

export default function RosterDisplay({ team, side, selectedSlot, onSelectSlot }: Props) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
        color: side === 'player' ? COLORS.accent : COLORS.danger,
        marginBottom: 8,
      }}>
        {side === 'player' ? 'YOUR ROSTER' : 'AI ROSTER'} ({team.roster.length}/5)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3, 4].map(i => {
          const slot = team.roster[i];
          if (!slot) {
            return (
              <div key={i} style={{
                padding: 12, minHeight: 80,
                background: COLORS.bgRaised,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 6,
                color: COLORS.textDim, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                empty
              </div>
            );
          }
          const agent = getAgent(slot.agentId);
          const weapon = getWeapon(slot.weaponId);
          const armor = getArmor(slot.armorId);
          const utility = slot.utilityId ? getUtility(slot.utilityId) : null;
          const isSelected = selectedSlot === i;
          const clickable = !!onSelectSlot;
          return (
            <button
              key={i}
              onClick={() => onSelectSlot?.(i)}
              disabled={!clickable}
              style={{
                padding: 12, minHeight: 80, textAlign: 'left',
                background: isSelected ? COLORS.bgHover : COLORS.bgRaised,
                border: `1px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                borderRadius: 6,
                color: COLORS.text,
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                {agent.role}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6 }}>
                {weapon.name} · {armor.name}
              </div>
              {utility && (
                <div style={{ fontSize: 10, color: COLORS.warning, marginTop: 2 }}>
                  +{utility.name}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
