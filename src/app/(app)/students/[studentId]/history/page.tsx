"use client";

import { useEffect, useState } from "react";
import { History, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { PageState as AccountState, PanelSkeleton } from "@/components/ui/skeleton";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type Membership = {
  squad_number: string | null;
  start_date: string | null;
  end_date: string | null;
};

type WeeklyRecord = {
  academic_year: number | null;
  week_number: number | null;
  start_time: string | null;
  calculated_end_time: string | null;
  belt_test_updated_at: string | null;
  initial_belt_levels: Record<string, number> | null;
  final_belt_levels: Record<string, number> | null;
};

type HistoryResponse = {
  student: {
    id: string;
    name: string | null;
    email: string | null;
  };
  memberships: Membership[];
  weeklyRecords: WeeklyRecord[];
};

export default function StudentHistoryPage() {
  const router = useRouter();
  const params = useParams<{ studentId: string }>();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<CurrentUserProfile | { status: "loading" }>(cachedProfile ?? { status: "loading" });
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

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
      profileState.profile.role === "student"
    ) {
      router.replace("/student");
    }
  }, [profileState, router]);

  useEffect(() => {
    if (
      profileState.status !== "authenticated" ||
      (profileState.profile.role !== "campus_manager" &&
        profileState.profile.role !== "mentor") ||
      !params.studentId
    ) {
      return;
    }

    const controller = new AbortController();

    async function loadHistory() {
      setIsLoading(true);
      setError("");
      setNotFound(false);

      try {
        const response = await fetch(`/api/students/${params.studentId}/history`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as HistoryResponse & { error?: string };

        if (response.status === 404) {
          setNotFound(true);
          return;
        }

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load student history.");
        }

        setData(result);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load student history.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();
    return () => controller.abort();
  }, [params.studentId, profileState, router]);

  if (profileState.status === "loading") {
    return <AccountState message="Checking your account..." loading />;
  }
  if (profileState.status === "unauthenticated") {
    return <AccountState message="Redirecting to login..." loading />;
  }
  if (profileState.status === "unassigned") {
    return <AccountState message="Account not assigned" detail="Your account does not have an assigned profile yet." />;
  }
  if (profileState.status === "invalid_role") {
    return <AccountState message="Account role not supported" />;
  }
  if (profileState.status === "error") {
    return <AccountState message="Unable to load your account" detail={profileState.message} />;
  }
  const currentProfile = profileState.status === "authenticated" ? profileState.profile : null;

  if (!currentProfile) {
    return <AccountState message="Unable to determine your account role" />;
  }
  if (currentProfile.role === "student") {
    return <AccountState message="Redirecting to your student area..." loading />;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
        <LoadingState />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
        <StatePanel title="Student not found" detail="This student is not part of your university." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
        <StatePanel title="Unable to load history" detail={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
        <StatePanel title="No history available" detail="Student history could not be loaded." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
      <div className="mb-8 pt-2">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-brand-text">Student history</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{data.student.name ?? "Unnamed student"}</h1>
        <p className="mt-2 text-sm text-muted">{data.student.email ?? "No email available"}</p>
      </div>

      <div className="grid gap-6">
        <HistorySection title="Membership history" icon={<Users size={18} />}>
          {data.memberships.length === 0 ? (
            <EmptyState message="No membership history available." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted"><tr><th className="px-6 py-3 font-semibold">Squad</th><th className="px-4 py-3 font-semibold">Start date</th><th className="px-6 py-3 font-semibold">End date</th></tr></thead><tbody className="divide-y divide-line">{data.memberships.map((membership, index) => <tr key={`${membership.squad_number}-${membership.start_date}-${index}`}><td className="px-6 py-4 font-semibold">{membership.squad_number ? `Squad ${membership.squad_number}` : "—"}</td><td className="px-4 py-4 text-muted">{formatDate(membership.start_date)}</td><td className="px-6 py-4 text-muted">{formatDate(membership.end_date)}</td></tr>)}</tbody></table></div>
          )}
        </HistorySection>

        <HistorySection title="Weekly belt history" icon={<History size={18} />}>
          {data.weeklyRecords.length === 0 ? (
            <EmptyState message="No weekly belt records are available for this student." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted"><tr><th className="px-6 py-3 font-semibold">Academic year</th><th className="px-4 py-3 font-semibold">Week</th><th className="px-4 py-3 font-semibold">Initial belt levels</th><th className="px-4 py-3 font-semibold">Final belt levels</th><th className="px-4 py-3 font-semibold">Started</th><th className="px-4 py-3 font-semibold">Ended</th><th className="px-6 py-3 font-semibold">Test/update</th></tr></thead><tbody className="divide-y divide-line">{data.weeklyRecords.map((record, index) => <tr key={`${record.academic_year}-${record.week_number}-${index}`} className="align-top hover:bg-brand-soft"><td className="px-6 py-4 font-semibold">{record.academic_year ?? "—"}</td><td className="px-4 py-4">{record.week_number ?? "—"}</td><td className="px-4 py-4"><BeltLevels levels={record.initial_belt_levels} /></td><td className="px-4 py-4"><BeltLevels levels={record.final_belt_levels} /></td><td className="px-4 py-4 text-muted">{formatTimestamp(record.start_time)}</td><td className="px-4 py-4 text-muted">{formatTimestamp(record.calculated_end_time)}</td><td className="px-6 py-4 text-muted">{formatTimestamp(record.belt_test_updated_at)}</td></tr>)}</tbody></table></div>
          )}
        </HistorySection>
      </div>
    </div>
  );
}

function HistorySection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-surface shadow-sm"><div className="flex items-center gap-3 border-b border-line px-6 py-5"><span className="text-brand-text">{icon}</span><h2 className="text-lg font-bold">{title}</h2></div>{children}</section>;
}

function BeltLevels({ levels }: { levels: Record<string, number> | null }) {
  if (!levels || Object.keys(levels).length === 0) return <span className="text-muted">—</span>;
  return <div className="flex max-w-xs flex-wrap gap-1.5">{Object.entries(levels).map(([name, value]) => <span className="rounded-full bg-page px-2 py-1 text-xs text-ink-2" key={name}>{name}: {value}</span>)}</div>;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function LoadingState() {
  return <PanelSkeleton rows={6} label="Loading student history" />;
}

function StatePanel({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm"><p className="text-lg font-bold">{title}</p><p className="mt-2 text-sm text-muted">{detail}</p></div>;
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-6 py-12 text-center text-sm text-muted">{message}</p>;
}

