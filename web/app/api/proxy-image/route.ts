import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/proxy-image?url=<encoded>
 *
 * Streams a remote image through this server so the browser sees it as
 * same-origin. Used by the Remotion shuffle-reveal video templates where
 * `<Img crossOrigin="anonymous">` against Firebase Storage URLs was
 * intermittently failing to decode under html2canvas, blocking team
 * logos from appearing in the exported MP4.
 *
 * Only Firebase Storage hosts are allowed (defence-in-depth SSRF guard).
 */
const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("host not allowed", { status: 400 });
  }

  const upstream = await fetch(target.toString(), {
    headers: { Accept: "image/*" },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("upstream error", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
    "Access-Control-Allow-Origin": "*",
  });

  return new NextResponse(upstream.body, { status: 200, headers });
}
