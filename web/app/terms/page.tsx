import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Indian Esports",
  description: "The rules, code of conduct, and terms that govern your use of Indian Esports tournaments for Valorant, Dota 2, and CS2.",
  alternates: { canonical: "https://iesports.in/terms" },
  openGraph: {
    title: "Terms of Service — Indian Esports",
    description: "Code of conduct, prize pool rules, and terms for Indian Esports tournaments.",
    url: "https://iesports.in/terms",
    siteName: "Indian Esports",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service — Indian Esports",
    description: "Code of conduct, prize pool rules, and terms for Indian Esports tournaments.",
  },
  robots: { index: true, follow: true },
};

const wrap: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "60px 24px 80px",
  color: "#1c1919",
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  lineHeight: 1.65,
  fontSize: 15,
};
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 900, marginBottom: 8, color: "#111" };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, marginTop: 36, marginBottom: 10, color: "#111" };
const meta: React.CSSProperties = { fontSize: 13, color: "#888", marginBottom: 28 };
const ul: React.CSSProperties = { paddingLeft: 22, margin: "8px 0" };
const a: React.CSSProperties = { color: "#b8860b", textDecoration: "underline" };

export default function TermsPage() {
  return (
    <main style={{ background: "#F8F7F4", minHeight: "100vh" }}>
      <div style={wrap}>
        <Link href="/" style={{ ...a, fontSize: 13 }}>← Back to home</Link>
        <h1 style={{ ...h1, marginTop: 18 }}>Terms of Service</h1>
        <div style={meta}>Last updated: 14 April 2026</div>

        <p>
          Welcome to Indian Esports (&quot;iesports&quot;). By creating an account, linking a third-party account, or
          registering for any tournament on <a href="https://iesports.in" style={a}>iesports.in</a>, you agree to be bound by
          these Terms of Service. Please read them carefully.
        </p>

        <h2 style={h2}>1. Eligibility</h2>
        <ul style={ul}>
          <li>You must be at least 13 years old to use iesports. Users under 18 must have a parent or guardian&apos;s permission.</li>
          <li>You must hold a valid account on each game you wish to compete in — Valorant (Riot Games), Dota 2 (Steam), or CS2 / Counter-Strike 2 (Steam) — and a valid Riot Games and/or Steam account as required.</li>
          <li>You must comply with the terms of service of the underlying game and the operator of any third-party service you connect to iesports.</li>
        </ul>

        <h2 style={h2}>2. Accounts</h2>
        <ul style={ul}>
          <li>You are responsible for keeping your iesports account credentials secure.</li>
          <li>One person, one account. Multi-accounting and account-sharing are prohibited.</li>
          <li>You must provide accurate information when linking Steam, Discord, or Riot accounts. Linking an account that is not yours, or impersonating another player, will result in a ban.</li>
        </ul>

        <h2 style={h2}>3. Code of conduct</h2>
        <p>While using iesports you agree NOT to:</p>
        <ul style={ul}>
          <li>Smurf, boost, or use a higher-ranked teammate&apos;s account in tournaments below their rank tier.</li>
          <li>Use cheats, hacks, scripts, third-party automation, or any unfair advantage in matches.</li>
          <li>Match-fix, throw matches, or collude with opponents.</li>
          <li>Harass, threaten, dox, or abuse other players, staff, or community members.</li>
          <li>Post hateful, sexually explicit, or illegal content in chats, profiles, or team names.</li>
          <li>Attempt to disrupt, reverse-engineer, or gain unauthorised access to the platform.</li>
        </ul>
        <p>Violations may result in match forfeits, removal from tournaments, forfeiture of prizes, and permanent bans.</p>

        <h2 style={h2}>4. Tournaments, entry fees, and prizes</h2>
        <ul style={ul}>
          <li>Each tournament has its own ruleset published on the tournament page. By registering you accept that ruleset.</li>
          <li>Tournaments may be free or may have an entry fee. Entry fees are clearly displayed before registration.</li>
          <li>Where entry fees are charged, at least seventy percent (70%) of net entry fees collected go directly into the tournament prize pool. The remainder funds platform operations.</li>
          <li>iesports tournaments are games of skill. We do not operate any form of gambling, betting, wagering, or chance-based contest.</li>
          <li>Prize payouts are made to verified winners within thirty (30) days of tournament completion, subject to identity verification and applicable Indian tax law (TDS where required).</li>
        </ul>

        <h2 style={h2}>5. Refunds</h2>
        <p>
          Entry fees are non-refundable once a tournament has begun. If a tournament is cancelled by iesports before
          matches start, all paid entry fees will be refunded in full within fourteen (14) days.
        </p>

        <h2 style={h2}>6. Rank verification</h2>
        <p>
          We verify in-game ranks using official APIs (Riot Games API, OpenDota) and, where necessary, manual review.
          Submitting falsified screenshots, manipulating rank, or attempting to circumvent rank verification is a serious
          violation and will result in a permanent ban from the platform.
        </p>

        <h2 style={h2}>7. Riot Games and other third-party services</h2>
        <p>
          iesports uses the Riot Games API, Steam, Discord, OpenDota, Vercel, and Google Firebase as part of its operation.
          Your use of these services through iesports is also governed by their respective terms of service. iesports is an
          independent platform and is not affiliated with, endorsed by, or sponsored by Riot Games, Valve, Discord, or any
          other game publisher.
        </p>

        <h2 style={h2}>8. Intellectual property</h2>
        <p>
          Game names, characters, logos, and assets belong to their respective publishers. iesports&apos; own brand, design,
          code, and tournament structures are owned by iesports. You may not copy, scrape, or redistribute platform content
          without written permission.
        </p>

        <h2 style={h2}>9. Disclaimers</h2>
        <p>
          The platform is provided &quot;as is&quot; without warranties of any kind. We do our best to keep tournaments
          running smoothly, but we cannot guarantee uninterrupted service, freedom from bugs, or that match outcomes will
          always be free from technical issues outside our control (game server outages, ISP problems, third-party API
          downtime).
        </p>

        <h2 style={h2}>10. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, iesports&apos; total liability to you for any claim arising from your use
          of the platform is limited to the entry fees you have paid in the previous twelve (12) months.
        </p>

        <h2 style={h2}>11. Termination</h2>
        <p>
          We may suspend or terminate your account at any time for violation of these terms. You may delete your account at
          any time by contacting <a href="mailto:iesportsbot@gmail.com" style={a}>iesportsbot@gmail.com</a>.
        </p>

        <h2 style={h2}>12. Governing law</h2>
        <p>
          These terms are governed by the laws of India. Any disputes will be subject to the exclusive jurisdiction of the
          courts of Bengaluru, Karnataka.
        </p>

        <h2 style={h2}>13. Contact</h2>
        <p>
          Indian Esports — Bengaluru, India.<br />
          Email: <a href="mailto:iesportsbot@gmail.com" style={a}>iesportsbot@gmail.com</a>
        </p>

        <div style={{ marginTop: 48, padding: "20px 22px", background: "#fff", border: "1px solid #E5E3DF", borderRadius: 12, fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          iesports isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone
          officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are
          trademarks or registered trademarks of Riot Games, Inc.
        </div>
      </div>
    </main>
  );
}
