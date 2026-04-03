import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/upload-share-bg
 *
 * Uploads a share image background to Firebase Storage via Admin SDK
 * (bypasses client-side storage rules).
 *
 * Form data: file (image), type (default|overview|register|teams|schedule|format|flow), tournamentId (optional)
 * Header: x-admin-secret
 */
export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-admin-secret") ||
    req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "default";
    const tournamentId = (formData.get("tournamentId") as string) || "tmp";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 5MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `tournament-share-bgs/${tournamentId}/${type}.${ext}`;

    const bucket = adminStorage.bucket("iesports-auth.firebasestorage.app");
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: { uploadedBy: "admin" },
      },
    });

    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Upload failed" },
      { status: 500 },
    );
  }
}
