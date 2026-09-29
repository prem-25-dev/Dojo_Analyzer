"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { PageState } from "@/components/ui/skeleton";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

export default function StudentPage() {
  const router = useRouter();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<CurrentUserProfile | { status: "loading" }>(cachedProfile ?? { status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const result = await getCurrentUserProfile();

      if (isMounted) {
        setProfileState(result);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileState.status === "unauthenticated") {
      router.replace("/login");
    }

    if (
      profileState.status === "authenticated" &&
      profileState.profile.role !== "student"
    ) {
      router.replace("/");
    }
  }, [profileState, router]);

  if (profileState.status === "loading") {
    return <StudentState message="Checking your account..." />;
  }

  if (profileState.status === "unauthenticated") {
    return <StudentState message="Redirecting to login..." />;
  }

  if (profileState.status === "unassigned") {
    return (
      <StudentState
        message="Account not assigned"
        detail="Your Google account does not have an assigned profile yet."
      />
    );
  }

  if (profileState.status === "invalid_role") {
    return (
      <StudentState
        message="Account role not supported"
        detail="Your profile does not have a supported account role."
      />
    );
  }

  if (profileState.status === "error") {
    return <StudentState message="Unable to load your account" detail={profileState.message} />;
  }

  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;

  if (!currentProfile || currentProfile.role !== "student") {
    return <StudentState message="Redirecting to dashboard..." />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 text-ink">
      <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-text">
          Student area
        </p>
        <h1 className="mt-3 text-2xl font-bold">Your dashboard is coming soon</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your student account is signed in and assigned correctly.
        </p>
      </section>
    </main>
  );
}

function StudentState({ message, detail }: { message: string; detail?: string }) {
  const loading = !detail && /^(Checking|Redirecting)/.test(message);
  return (
    <main className="min-h-screen bg-page text-ink">
      <PageState message={message} detail={detail} loading={loading} />
    </main>
  );
}
