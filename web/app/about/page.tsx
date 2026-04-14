import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Indian Esports",
  description: "Indian Esports is India's rank-verified tournament platform for Valorant, Dota 2, and CS2 (Counter-Strike 2) players. Online and offline events with transparent prize pools.",
  keywords: ["Indian Esports", "iesports", "Valorant tournaments India", "Dota 2 tournaments India", "CS2 tournaments India", "rank verified tournaments", "Bengaluru esports"],
  alternates: { canonical: "https://iesports.in/about" },
  openGraph: {
    title: "About Indian Esports",
    description: "India's rank-verified tournament platform for Valorant, Dota 2, and CS2.",
    url: "https://iesports.in/about",
    siteName: "Indian Esports",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Indian Esports",
    description: "India's rank-verified tournament platform for Valorant, Dota 2, and CS2.",
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

export default function AboutPage() {
  return (
    <main style={{ background: "#F8F7F4", minHeight: "100vh" }}>
      <div style={wrap}>
        <Link href="/" style={{ ...a, fontSize: 13 }}>← Back to home</Link>
        <h1 style={{ ...h1, marginTop: 18 }}>About Indian Esports</h1>
        <div style={meta}>India&apos;s rank-verified tournament platform for serious-but-casual players.</div>

        <h2 style={h2}>What we do</h2>
        <p>
          Indian Esports (iesports) hosts online and offline tournaments for Valorant, Dota 2, and CS2 (Counter-Strike 2)
          in India. Every player on the platform has their in-game rank verified before they enter a bracket, so matches
          are fair and skill-balanced. We exist for the player who takes the game seriously but doesn&apos;t want to grind a
          pro path — the player who wants honest competition, real prize pools, and a community that shows up.
        </p>

        <h2 style={h2}>How players benefit</h2>
        <ul style={ul}>
          <li><strong>Rank-verified matchmaking.</strong> Brackets are split by verified Riot competitive tier and Dota MMR. No surprise smurfs, no boosted teammates.</li>
          <li><strong>Transparent prize pools.</strong> At least 70% of net entry fees go directly into the prize pool. The numbers are visible on every tournament page.</li>
          <li><strong>Multiple formats.</strong> Solo queue, snake-draft shuffles, captain auctions, and pre-formed teams — pick the format that fits your friend group.</li>
          <li><strong>Offline meets online.</strong> We run regular LAN events at Domin8 Esports Cafe and keep the online platform alive between events.</li>
        </ul>

        <h2 style={h2}>Games we support</h2>
        <ul style={ul}>
          <li><strong>Valorant</strong> — live. S/A/B/C tier brackets based on verified Riot competitive rank, with shuffle, auction, and standard team formats.</li>
          <li><strong>Dota 2</strong> — live. 5v5 team tournaments and weekly solo scoring tournaments with rank verification via Steam and OpenDota.</li>
          <li><strong>CS2 (Counter-Strike 2)</strong> — live. Solo and team tournaments with Steam-verified rosters.</li>
          <li><strong>Call of Duty</strong> — coming soon.</li>
        </ul>

        <h2 style={h2}>How rank verification works</h2>
        <p>
          For Dota 2 we read your public match history and rank tier from the OpenDota API after you link your Steam
          account via Steam OpenID. For Valorant we look up your Riot ID and current competitive tier through the Riot
          Games API after you link your Riot account. Once we go live with Riot Sign-On, Valorant verification will move to
          the official RSO flow so you never share credentials with anyone but Riot themselves.
        </p>

        <h2 style={h2}>Who builds this</h2>
        <p>
          iesports is built by Sarthak Jain in Bengaluru, India, with a small group of community organisers and volunteer
          tournament admins. We&apos;re bootstrapped, player-funded, and run on Next.js, Firebase, and Vercel.
        </p>

        <h2 style={h2}>Contact</h2>
        <p>
          Indian Esports — Bengaluru, India.<br />
          Email: <a href="mailto:iesportsbot@gmail.com" style={a}>iesportsbot@gmail.com</a><br />
          Discord: join from the link on the homepage.
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
