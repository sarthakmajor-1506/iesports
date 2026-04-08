import { NextRequest, NextResponse } from "next/server";
import { sendDM } from "@/lib/discord";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { discordId, message } = await req.json();
  if (!discordId) return NextResponse.json({ error: "discordId required" }, { status: 400 });

  const result = await sendDM(
    discordId,
    message || "✅ **Registration Confirmed!**\n\nYou're registered for an upcoming tournament on IEsports.\n\n📎 https://iesports.in"
  );

  return NextResponse.json(result);
}
