"use client";

/**
 * Permalink page for the Wall of Shame.
 *
 * Renders the WallOfShame component with `forceOpen` so the modal is open
 * on mount. Sharable URL:
 *   /valorant/tournament/{id}/wall-of-shame
 *
 * No close button is shown (the modal IS the page); voting still requires
 * sign-in via the existing flow.
 */

import { use } from "react";
import WallOfShame from "@/app/components/WallOfShame";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";

export default function WallOfShamePermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  return (
    <WallOfShame
      tournamentId={id}
      user={user}
      forceOpen
      onRequireLogin={() => {
        // Bounce to login then back here, preserving the link the user came in on.
        try {
          sessionStorage.setItem(
            "redirectAfterLogin",
            `/valorant/tournament/${id}/wall-of-shame`,
          );
        } catch { /* private mode / disabled — skip */ }
        router.push("/login");
      }}
    />
  );
}
