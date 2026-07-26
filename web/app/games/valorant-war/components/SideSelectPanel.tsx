'use client';
import { COLORS } from '../data/colors';
import type { TeamRole } from '../data/types';

interface Props {
  onPick: (role: TeamRole) => Promise<void>;
  busy: boolean;
}

export default function SideSelectPanel({ onPick, busy }: Props) {
  return (
    <div style={{
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 24,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700,
        color: COLORS.text, letterSpacing: '0.05em',
        marginBottom: 4,
      }}>
        CHOOSE YOUR SIDE
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
        Locked for the whole match. Attacker picks one site to push each round; defender stays put.
      </div>
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button onClick={() => onPick('attacker')} disabled={busy} style={{
          padding: 24, textAlign: 'left',
          background: COLORS.bgHover,
          border: `2px solid ${COLORS.warning}`,
          borderRadius: 6,
          color: COLORS.text,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.warning }}>ATTACKER</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            Push one site per round. Stack agents to overwhelm. Picks the focus site.
          </div>
        </button>
        <button onClick={() => onPick('defender')} disabled={busy} style={{
          padding: 24, textAlign: 'left',
          background: COLORS.bgHover,
          border: `2px solid ${COLORS.accent}`,
          borderRadius: 6,
          color: COLORS.text,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.accent }}>DEFENDER</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            Hold sites. Spread or stack — guess where the AI will push.
          </div>
        </button>
      </div>
    </div>
  );
}
