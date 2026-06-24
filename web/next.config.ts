import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "media.valorant-api.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  poweredByHeader: false,
  async headers() {
    // Baseline security headers (HSTS is already added by Vercel). No strict CSP
    // here yet — the app loads many third-party scripts (Firebase, gtag, Razorpay,
    // Discord/Steam/Valorant CDNs), so a CSP needs a careful allowlist pass to
    // avoid breaking things; these headers are the safe, high-value subset.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },              // clickjacking
          { key: "X-Content-Type-Options", value: "nosniff" },          // MIME sniffing
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
