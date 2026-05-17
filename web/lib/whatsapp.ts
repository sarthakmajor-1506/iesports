import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Queue a WhatsApp message for the standalone whatsapp/ sender service to
 * deliver to the group (mirrors the Discord result post).
 *
 * Best-effort by design — a WhatsApp problem must NEVER break result
 * fetching/writing, so this swallows all errors. `dedupeKey` prevents a
 * double-post if the same result is committed twice.
 */
export async function enqueueWhatsApp(
  text: string,
  dedupeKey?: string,
  source = "web",
): Promise<void> {
  try {
    await adminDb.collection("whatsappOutbox").add({
      text,
      status: "pending",
      source,
      ...(dedupeKey ? { dedupeKey } : {}),
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("[WA] enqueue failed:", e?.message || e);
  }
}
