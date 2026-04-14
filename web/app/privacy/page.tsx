import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Indian Esports",
  description: "How Indian Esports collects, uses, and protects your data across Valorant, Dota 2, and CS2 tournaments.",
  alternates: { canonical: "https://iesports.in/privacy" },
  openGraph: {
    title: "Privacy Policy — Indian Esports",
    description: "How Indian Esports collects, uses, and protects your data across Valorant, Dota 2, and CS2 tournaments.",
    url: "https://iesports.in/privacy",
    siteName: "Indian Esports",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy — Indian Esports",
    description: "How Indian Esports collects, uses, and protects your data.",
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

export default function PrivacyPage() {
  return (
    <main style={{ background: "#F8F7F4", minHeight: "100vh" }}>
      <div style={wrap}>
        <Link href="/" style={{ ...a, fontSize: 13 }}>← Back to home</Link>
        <h1 style={{ ...h1, marginTop: 18 }}>Privacy Policy</h1>
        <div style={meta}>Last updated: 14 April 2026</div>

        <p>
          Indian Esports (&quot;iesports&quot;, &quot;we&quot;, &quot;us&quot;) operates the website
          {" "}<a href="https://iesports.in" style={a}>https://iesports.in</a> and provides an esports
          tournament platform for Valorant, Dota 2, and CS2 (Counter-Strike 2) players in India. This
          Privacy Policy explains what information we collect, how we use it, and your rights over it.
        </p>

        <h2 style={h2}>1. Information we collect</h2>
        <p>We collect only the data needed to verify your identity, confirm your in-game rank, and run tournaments fairly.</p>
        <ul style={ul}>
          <li><strong>Account &amp; contact:</strong> phone number (via Firebase Authentication OTP), display name.</li>
          <li><strong>Steam:</strong> Steam ID, Steam profile name, avatar — collected via Steam OpenID when you link your Steam account.</li>
          <li><strong>Discord:</strong> Discord user ID, username, avatar — collected via Discord OAuth when you link Discord.</li>
          <li><strong>Riot Games data:</strong> Riot ID (game name and tagline), PUUID, region, account level, current competitive tier and rank — collected via the Riot Games API after you link your Riot account.</li>
          <li><strong>Dota 2 match data:</strong> recent public match history, MMR estimates, and rank tier — fetched from OpenDota.</li>
          <li><strong>CS2 (Counter-Strike 2) data:</strong> Steam ID, public Steam profile information, and tournament participation history — collected via Steam OpenID when you link your Steam account.</li>
          <li><strong>Tournament activity:</strong> tournaments you have registered for, teams you belong to, match results, and scores within our scoring system.</li>
          <li><strong>Technical data:</strong> standard server logs and anonymous analytics (page views, device type) collected by Vercel Analytics.</li>
        </ul>

        <h2 style={h2}>2. How we use your information</h2>
        <ul style={ul}>
          <li>To create and authenticate your account.</li>
          <li>To verify that the in-game account you link belongs to you and that the rank you claim is accurate.</li>
          <li>To assign you to balanced tournament brackets based on your verified rank.</li>
          <li>To register you for tournaments, contact you about match scheduling, and publish public results and standings.</li>
          <li>To prevent smurfing, cheating, and abuse on the platform.</li>
          <li>To communicate operational updates about tournaments you have entered.</li>
        </ul>

        <h2 style={h2}>3. Riot Games data</h2>
        <p>
          We access Riot Games data only with your explicit consent, only for the purposes listed above, and only through
          official Riot Games APIs. We never request, store, or process your Riot account password. We do not share Riot data
          with third parties, do not use it to de-anonymise other players, and do not build alternative MMR or ranking
          systems from it. You may unlink your Riot account at any time from your profile, and you may request deletion of
          all stored Riot data by contacting us.
        </p>

        <h2 style={h2}>4. How we store and protect your data</h2>
        <p>
          All data is stored in Google Firebase Firestore (Google Cloud Platform). Connections to and from our website use
          HTTPS. API keys for third-party services are kept server-side only and are never exposed to the browser. Access to
          our admin tools is restricted to authorised iesports staff and protected by an admin secret.
        </p>

        <h2 style={h2}>5. Sharing</h2>
        <p>We do not sell your personal data. We share data only with:</p>
        <ul style={ul}>
          <li>Service providers we rely on to operate the platform: Google Firebase (database and authentication), Vercel (hosting and analytics), Riot Games (rank verification), Steam (account verification), Discord (account verification and community access), and OpenDota (Dota 2 match data).</li>
          <li>Law enforcement or government authorities when required by Indian law.</li>
        </ul>

        <h2 style={h2}>6. Your rights</h2>
        <p>You have the right to:</p>
        <ul style={ul}>
          <li>Access the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Request deletion of your account and all associated data.</li>
          <li>Unlink any connected third-party account (Steam, Discord, Riot) at any time.</li>
          <li>Withdraw consent for data processing, subject to obligations we have under Indian law.</li>
        </ul>
        <p>
          To exercise any of these rights, email us at <a href="mailto:iesportsbot@gmail.com" style={a}>iesportsbot@gmail.com</a>.
          We will respond within 30 days as required by the Digital Personal Data Protection Act, 2023 (India).
        </p>

        <h2 style={h2}>7. Data retention</h2>
        <p>
          We retain your account data for as long as your account is active. Tournament results and standings are retained
          indefinitely as part of public competition history. If you request account deletion we will remove your personal
          identifiers within 30 days, while keeping anonymised tournament results.
        </p>

        <h2 style={h2}>8. Children</h2>
        <p>
          The platform is not directed at children under 13. If you are under 18 you must have permission from a parent or
          legal guardian to use iesports.
        </p>

        <h2 style={h2}>9. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy. The &quot;Last updated&quot; date at the top of this page will reflect the most
          recent change. Material changes will be announced on the homepage.
        </p>

        <h2 style={h2}>10. Contact</h2>
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
