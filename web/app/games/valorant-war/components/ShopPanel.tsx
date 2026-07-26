// v2: split shop. Left = Recruitment (buy new agents). Right = Loadouts (per-owned-agent
// upgrades, all categories visible inline — no tab dancing).
'use client';
import { COLORS } from '../data/colors';
import { AGENTS, getAgent } from '../data/agents';
import { WEAPONS, getWeapon } from '../data/weapons';
import { ARMORS, getArmor } from '../data/armors';
import { UTILITIES, getUtility } from '../data/utilities';
import { useViewport } from '../lib/useViewport';
import type { MatchState, ShopAction } from '../data/types';

interface Props {
  state: MatchState;
  onShop: (action: ShopAction) => Promise<void>;
  onReadyPosition: () => Promise<void>;
  busy: boolean;
}

export default function ShopPanel({ state, onShop, onReadyPosition, busy }: Props) {
  const ownedIds = new Set(state.player.roster.map(s => s.agentId));
  const rosterFull = state.player.roster.length >= 5;
  const { isMobile } = useViewport();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '320px 1fr',
      gap: isMobile ? 12 : 16,
    }}>
      {/* Recruitment */}
      <div style={{
        background: COLORS.bgRaised,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8, padding: 14,
        color: COLORS.text,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: COLORS.textMuted, letterSpacing: '0.1em',
          marginBottom: 10,
        }}>
          RECRUITMENT ({state.player.roster.length}/5)
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {AGENTS.map(a => {
            const owned = ownedIds.has(a.id);
            const tooExpensive = a.cost > state.player.gold;
            const disabled = owned || rosterFull || tooExpensive || busy;
            return (
              <button
                key={a.id}
                onClick={() => onShop({ kind: 'buy_agent', agentId: a.id })}
                disabled={disabled}
                style={{
                  padding: 8, textAlign: 'left',
                  background: owned ? 'transparent' : COLORS.bg,
                  border: `1px solid ${owned ? COLORS.success : COLORS.border}`,
                  borderRadius: 4,
                  color: disabled ? COLORS.textDim : COLORS.text,
                  cursor: disabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.iconUrl} alt="" style={{
                  width: 36, height: 36, borderRadius: 4,
                  background: COLORS.bgRaised,
                  filter: disabled && !owned ? 'grayscale(80%)' : 'none',
                  objectFit: 'cover',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {a.role} · {a.abilityName}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 800,
                  color: owned ? COLORS.success : tooExpensive ? COLORS.danger : COLORS.warning,
                }}>
                  {owned ? '✓' : `${a.cost}g`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loadouts */}
      <div style={{
        background: COLORS.bgRaised,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8, padding: 14,
        color: COLORS.text,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: COLORS.textMuted, letterSpacing: '0.1em',
          }}>
            LOADOUTS
          </div>
          <button
            onClick={onReadyPosition}
            disabled={state.player.roster.length === 0 || busy}
            style={{
              padding: '8px 20px',
              background: state.player.roster.length === 0 ? COLORS.bgHover : COLORS.accent,
              color: state.player.roster.length === 0 ? COLORS.textDim : COLORS.bg,
              border: 'none', borderRadius: 4,
              fontWeight: 800, fontSize: 12, letterSpacing: '0.05em',
              cursor: state.player.roster.length === 0 || busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? '...' : 'POSITION →'}
          </button>
        </div>

        {state.player.roster.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center',
            color: COLORS.textMuted, fontSize: 13,
          }}>
            Recruit an agent first.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {state.player.roster.map((slot, idx) => (
              <LoadoutRow key={idx} state={state} slot={slot} idx={idx} onShop={onShop} busy={busy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadoutRow({
  state, slot, idx, onShop, busy,
}: {
  state: MatchState;
  slot: MatchState['player']['roster'][number];
  idx: number;
  onShop: (a: ShopAction) => Promise<void>;
  busy: boolean;
}) {
  const agent = getAgent(slot.agentId);
  const weapon = getWeapon(slot.weaponId);
  const armor = getArmor(slot.armorId);
  const utility = slot.utilityId ? getUtility(slot.utilityId) : null;
  const gold = state.player.gold;

  return (
    <div style={{
      padding: 10,
      background: COLORS.bg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.iconUrl} alt="" style={{
            width: 28, height: 28, borderRadius: 4,
            background: COLORS.bgRaised, objectFit: 'cover',
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted }}>{agent.role}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: COLORS.textDim }}>
          {weapon.name} · {armor.name}{utility && ` · ${utility.name}`}
        </div>
      </div>

      {/* Weapon options */}
      <UpgradeRow
        label="Weapon"
        items={WEAPONS.map(w => ({
          id: w.id,
          name: w.name,
          sub: `+${w.damageBonus} dmg`,
          cost: w.cost,
          equipped: slot.weaponId === w.id,
          disabled: slot.weaponId === w.id || w.cost > gold || busy,
          onClick: () => onShop({ kind: 'buy_weapon', slotIdx: idx, weaponId: w.id }),
        }))}
      />
      <UpgradeRow
        label="Armor"
        items={ARMORS.map(a => ({
          id: a.id,
          name: a.name,
          sub: `+${a.hpBonus} HP`,
          cost: a.cost,
          equipped: slot.armorId === a.id,
          disabled: slot.armorId === a.id || a.cost > gold || busy,
          onClick: () => onShop({ kind: 'buy_armor', slotIdx: idx, armorId: a.id }),
        }))}
      />
      <UpgradeRow
        label="Utility"
        items={UTILITIES.map(u => ({
          id: u.id,
          name: u.name,
          sub: u.effect.replace('_', ' '),
          cost: u.cost,
          equipped: slot.utilityId === u.id,
          disabled: slot.utilityId === u.id || u.cost > gold || busy,
          onClick: () => onShop({ kind: 'buy_utility', slotIdx: idx, utilityId: u.id }),
        }))}
      />
    </div>
  );
}

interface UpgradeItem {
  id: string;
  name: string;
  sub: string;
  cost: number;
  equipped: boolean;
  disabled: boolean;
  onClick: () => void;
}

function UpgradeRow({ label, items }: { label: string; items: UpgradeItem[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '60px 1fr',
      gap: 8, alignItems: 'center', marginTop: 8,
    }}>
      <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: 4 }}>
        {items.map(it => (
          <button
            key={it.id}
            onClick={it.onClick}
            disabled={it.disabled}
            style={{
              padding: '6px 8px', textAlign: 'left',
              background: it.equipped ? 'rgba(74,222,128,0.12)' :
                          it.disabled ? 'transparent' : COLORS.bgHover,
              border: `1px solid ${it.equipped ? COLORS.success : COLORS.border}`,
              borderRadius: 3,
              color: it.equipped ? COLORS.success :
                     it.disabled ? COLORS.textDim : COLORS.text,
              cursor: it.disabled ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
            }}
          >
            <div style={{ fontWeight: 700 }}>{it.name}</div>
            <div style={{ color: COLORS.textMuted, fontSize: 9 }}>{it.sub}</div>
            <div style={{
              color: it.equipped ? COLORS.success : COLORS.warning,
              fontWeight: 700, fontSize: 9,
            }}>
              {it.equipped ? '✓ EQUIPPED' : `${it.cost}g`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
