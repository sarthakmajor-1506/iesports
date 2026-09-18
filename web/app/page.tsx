/**
 * Landing page shell — a Server Component, deliberately.
 *
 * The tournament card is the first fold, so it has to be in the HTML. When this
 * page was `"use client"` the card could not start loading until the bundle had
 * downloaded and hydrated, and only then did it fetch — 2.4–4.4s of blank card
 * on every visit. Reading Firestore here puts the card in the first paint.
 *
 * `revalidate` caches that HTML for a minute, so the read is amortised across
 * visitors instead of charged to each one. A minute of drift on a slot counter
 * is fine: the card is a teaser, and the tournament page is what actually gates
 * registration (transactionally — see lib/registrationSlots.ts).
 *
 * The fetch is wrapped because the build's "Collecting page data" pass has no
 * Firebase credentials in its env (the reason lib/firebaseAdmin.ts inits
 * lazily). A failure there must degrade to an empty landing page, never break
 * the deploy.
 */

import { getFeaturedTournaments, EMPTY_FEATURED } from "@/lib/featuredTournaments";
import HomeClient from "./HomeClient";

export const revalidate = 60;

export default async function Home() {
  let initial = EMPTY_FEATURED();
  try {
    initial = await getFeaturedTournaments();
  } catch (e) {
    console.error("[Landing] Featured tournament read failed:", e);
  }
  return <HomeClient initial={initial} />;
}
