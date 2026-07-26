'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { COLORS } from '../../data/colors';
import EconomyBar from '../../components/EconomyBar';
import MapView from '../../components/MapView';
import ShopPanel from '../../components/ShopPanel';
import PositionPanel from '../../components/PositionPanel';
import SideSelectPanel from '../../components/SideSelectPanel';
import BattleRenderer from '../../components/BattleRenderer';
import type {
  MatchState, ShopAction, RoundResult, TeamRole, PositionAction,
} from '../../data/types';

type View =
  | { kind: 'shop' }
  | { kind: 'position' }
  | { kind: 'playing'; result: RoundResult }
  | { kind: 'finished' };

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params?.matchId ?? '';
  const [state, setState] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: 'shop' });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/games/valorant-war/match/${matchId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed to load match');
      setState(j.state);
      if (j.state.status === 'completed') setView({ kind: 'finished' });
      else if (j.state.phase === 'position') setView({ kind: 'position' });
      else if (j.state.phase === 'shop') setView({ kind: 'shop' });
    } catch (e) { setError((e as Error).message); }
  }, [matchId]);

  useEffect(() => { if (matchId) refresh(); }, [matchId, refresh]);

  async function callApi(path: string, body: unknown): Promise<{ state?: MatchState; roundResult?: RoundResult; error?: string } | null> {
    setBusy(true); setError(null);
    try {
      const r = await fetch(path, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'request failed');
      if (j.state) setState(j.state);
      return j;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }

  async function pickSide(role: TeamRole) {
    await callApi('/api/games/valorant-war/side-select', { matchId, role });
    setView({ kind: 'shop' });
  }

  async function shop(action: ShopAction) {
    await callApi('/api/games/valorant-war/shop', { matchId, action });
  }

  async function readyPosition() {
    await callApi('/api/games/valorant-war/ready-position', { matchId });
    setView({ kind: 'position' });
  }

  async function position(action: PositionAction) {
    await callApi('/api/games/valorant-war/position', { matchId, action });
  }

  async function playRound() {
    const j = await callApi('/api/games/valorant-war/play-round', { matchId });
    if (j?.roundResult) setView({ kind: 'playing', result: j.roundResult });
  }

  if (!state) {
    return (
      <main style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, padding: 32 }}>
        {error ? <div style={{ color: COLORS.danger }}>{error}</div> : 'Loading...'}
      </main>
    );
  }

  const showAiPositions = view.kind === 'playing' || view.kind === 'finished';

  return (
    <main style={{
      minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
      padding: 'clamp(12px, 2.5vw, 24px)', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 8,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 900 }}>
            Atomic War <span style={{ color: COLORS.accent }}>·</span> {state.map}
          </h1>
          <a href="/games/valorant-war" style={{
            color: COLORS.textMuted, fontSize: 12, textDecoration: 'none',
          }}>← Lobby</a>
        </div>

        <EconomyBar
          state={state}
          displayRound={view.kind === 'playing' ? view.result.roundNumber : state.currentRound}
        />

        {/* MapView shown only during shop/position. During battle the canvas renders its own map.
            During finished state the canvas isn't running, so suppress the map. */}
        {(state.phase === 'shop' || state.phase === 'position') && view.kind !== 'playing' && (
          <MapView
            playerRoster={state.player.roster}
            aiRoster={state.ai.roster}
            playerRole={state.playerRole}
            focusSite={state.focusSite}
            showAi={showAiPositions}
          />
        )}

        {state.phase === 'side_select' && (
          <SideSelectPanel onPick={pickSide} busy={busy} />
        )}

        {view.kind === 'shop' && state.phase === 'shop' && (
          <ShopPanel
            state={state}
            onShop={shop}
            onReadyPosition={readyPosition}
            busy={busy}
          />
        )}

        {view.kind === 'position' && state.phase === 'position' && (
          <PositionPanel
            state={state}
            onAction={position}
            onPlay={playRound}
            busy={busy}
          />
        )}

        {view.kind === 'playing' && (
          <BattleRenderer
            events={view.result.events}
            playerRoster={view.result.startingPlayerRoster}
            aiRoster={view.result.startingAiRoster}
            playerRole={view.result.playerRole}
            focusSite={view.result.focusSite}
            onComplete={() => {
              if (state.status === 'completed') setView({ kind: 'finished' });
              else {
                setView({ kind: 'shop' });
              }
            }}
          />
        )}

        {view.kind === 'playing' && state.rounds.length > 0 && (
          <RoundSummary
            result={view.result}
            onContinue={() => {
              if (state.status === 'completed') setView({ kind: 'finished' });
              else setView({ kind: 'shop' });
            }}
          />
        )}

        {view.kind === 'finished' && <FinishedPanel state={state} />}

        {error && (
          <div style={{
            marginTop: 16, padding: 10,
            background: 'rgba(255,82,82,0.1)',
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 4,
            color: COLORS.danger, fontSize: 13,
          }}>{error}</div>
        )}
      </div>
    </main>
  );
}

function RoundSummary({ result, onContinue }: { result: RoundResult; onContinue: () => void }) {
  const winnerLabel =
    result.winner === 'player' ? 'YOU WON THE ROUND' :
    result.winner === 'ai'     ? 'AI WON THE ROUND'  :
                                 'TIE — economy favors you';
  const winnerColor =
    result.winner === 'player' || result.winner === 'tie' ? COLORS.success : COLORS.danger;
  return (
    <div style={{
      marginTop: 16,
      padding: 16,
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      color: COLORS.text,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: winnerColor }}>{winnerLabel}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
          Round {result.roundNumber} · kills {result.killCounts.player}–{result.killCounts.ai} ·
          <span style={{ color: COLORS.warning, marginLeft: 6 }}>
            +{result.goldAwarded.player}g · AI +{result.goldAwarded.ai}g
          </span>
        </div>
      </div>
      <button onClick={onContinue} style={{
        padding: '8px 20px',
        background: COLORS.accent, color: COLORS.bg,
        border: 'none', borderRadius: 4,
        fontWeight: 800, fontSize: 12, cursor: 'pointer',
      }}>CONTINUE →</button>
    </div>
  );
}

function FinishedPanel({ state }: { state: MatchState }) {
  const won = state.winner === 'player';
  return (
    <div style={{
      padding: 32, textAlign: 'center',
      background: COLORS.bgRaised,
      border: `2px solid ${won ? COLORS.success : COLORS.danger}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 32, fontWeight: 900,
        color: won ? COLORS.success : COLORS.danger,
      }}>
        {won ? 'VICTORY' : 'DEFEAT'}
      </div>
      <div style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 4 }}>
        Final: {state.playerScore} – {state.aiScore}
      </div>
      <div style={{
        marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center',
      }}>
        <a href="/games/valorant-war" style={{
          padding: '10px 24px',
          background: COLORS.accent, color: COLORS.bg,
          textDecoration: 'none', borderRadius: 4,
          fontWeight: 800, fontSize: 13,
        }}>PLAY AGAIN</a>
        <a href="/" style={{
          padding: '10px 24px',
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textMuted,
          textDecoration: 'none', borderRadius: 4,
          fontSize: 13,
        }}>← iEsports</a>
      </div>
    </div>
  );
}
