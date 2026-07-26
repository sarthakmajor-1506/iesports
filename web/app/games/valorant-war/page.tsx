'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { COLORS } from './data/colors';

export default function LobbyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startNew() {
    setBusy(true); setError(null);
    try {
      const idToken = user ? await user.getIdToken() : undefined;
      const r = await fetch('/api/games/valorant-war/new-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed to create match');
      router.push(`/games/valorant-war/match/${j.matchId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: COLORS.bg, color: COLORS.text,
      padding: 'clamp(16px, 4vw, 32px)', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Valorant <span style={{ color: COLORS.accent }}>Atomic War</span>
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
          A side-game auto-battler. Buy agents, equip them, and fight a 7-round duel
          against the AI. Match state is server-authoritative — no cheating yourself rich.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button onClick={startNew} disabled={busy} style={{
            padding: '12px 32px',
            background: busy ? COLORS.bgHover : COLORS.accent,
            color: busy ? COLORS.textDim : COLORS.bg,
            border: 'none', borderRadius: 4,
            fontWeight: 800, fontSize: 14, letterSpacing: '0.05em',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
            {busy ? 'CREATING...' : 'NEW MATCH'}
          </button>
          <a href="/" style={{
            padding: '12px 24px',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.textMuted,
            textDecoration: 'none', fontSize: 13,
            display: 'flex', alignItems: 'center',
          }}>← Back to iEsports</a>
        </div>
        {error && (
          <div style={{
            marginTop: 16, padding: 10,
            background: 'rgba(255,82,82,0.1)',
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 4,
            color: COLORS.danger, fontSize: 13,
          }}>
            {error}
          </div>
        )}
        <div style={{ marginTop: 32, fontSize: 12, color: COLORS.textDim }}>
          {user
            ? 'Logged in — match will be saved to your record.'
            : 'Anonymous — match recorded without a player ID.'}
        </div>
      </div>
    </main>
  );
}
