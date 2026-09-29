"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageState as FullPageState } from "@/components/ui/skeleton";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

export default function Home() {
  return (
    <Suspense fallback={<FullPageState message="Loading dashboard…" loading />}>
      <DashboardHome />
    </Suspense>
  );
}

function DashboardHome() {
  const router = useRouter();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });

  useEffect(() => {
    let mounted = true;
    getCurrentUserProfile().then((result) => {
      if (mounted) setProfileState(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileState.status === "unauthenticated") router.replace("/login");
    if (
      profileState.status === "authenticated" &&
      profileState.profile.role === "student"
    )
      router.replace("/student");
  }, [profileState, router]);

  if (profileState.status === "loading")
    return <FullPageState message="Checking your account…" loading />;
  if (profileState.status === "unauthenticated")
    return <FullPageState message="Redirecting to login…" loading />;
  if (profileState.status === "unassigned")
    return (
      <FullPageState
        message="Account not assigned"
        detail="Your Google account does not have an assigned profile yet."
      />
    );
  if (profileState.status === "invalid_role")
    return <FullPageState message="Account role not supported" />;
  if (profileState.status === "error")
    return (
      <FullPageState
        message="Unable to load your account"
        detail={profileState.message}
      />
    );
  if (
    profileState.status !== "authenticated" ||
    profileState.profile.role === "student"
  )
    return <FullPageState message="Redirecting…" loading />;

  return <DashboardView />;
}

