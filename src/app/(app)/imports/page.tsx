"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
} from "lucide-react";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { formatWeekLabel } from "@/lib/weeks";
import { PageState, PanelSkeleton } from "@/components/ui/skeleton";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type ImportRecord = {
  id: string;
  week_id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  row_count: number;
  is_current: boolean;
  week_number: number | null;
  academic_year: number | null;
  start_date: string | null;
  end_date: string | null;
};

type ImportsResponse = {
  imports: ImportRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
};

type UniversityOption = { id: string; name: string };

const PAGE_LIMIT = 20;

export default function ImportsPage() {
  const router = useRouter();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [universities, setUniversities] = useState<UniversityOption[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState("");

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
      return;
    }

    if (
      profileState.status === "authenticated" &&
      profileState.profile.role !== "campus_manager" &&
      profileState.profile.role !== "super_admin"
    ) {
      router.replace("/");
    }
  }, [profileState, router]);

  useEffect(() => {
    if (
      profileState.status !== "authenticated" ||
      (profileState.profile.role !== "campus_manager" &&
        profileState.profile.role !== "super_admin")
    ) {
      return;
    }
    const authenticatedProfile = profileState.profile;

    const controller = new AbortController();

    async function loadUniversities() {
      if (authenticatedProfile.role !== "super_admin") return;
      const response = await fetch("/api/super-admin/universities", {
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        universities?: UniversityOption[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Unable to load universities.");
      setUniversities(result.universities ?? []);
      setSelectedUniversityId(
        (current) => current || result.universities?.[0]?.id || "",
      );
    }

    async function loadImports() {
      await loadUniversities();
      if (
        authenticatedProfile.role === "super_admin" &&
        !selectedUniversityId
      ) {
        setImports([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError("");

      try {
        const universityQuery =
          authenticatedProfile.role === "super_admin"
            ? `&university_id=${encodeURIComponent(selectedUniversityId)}`
            : "";
        const response = await fetch(
          `/api/imports?page=${pagination.page}&limit=${PAGE_LIMIT}${universityQuery}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as ImportsResponse;

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load import history.");
        }

        setImports(result.imports);
        setPagination(result.pagination);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load import history.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadImports();

    return () => controller.abort();
  }, [pagination.page, profileState, selectedUniversityId]);

  if (profileState.status === "loading") {
    return <PageState message="Checking your account..." loading />;
  }

  if (profileState.status === "unauthenticated") {
    return <PageState message="Redirecting to login..." loading />;
  }

  if (profileState.status === "unassigned") {
    return (
      <PageState
        message="Account not assigned"
        detail="Your Google account does not have an assigned profile yet."
      />
    );
  }

  if (profileState.status === "invalid_role") {
    return <PageState message="Import history access is not authorized" />;
  }

  if (profileState.status === "error") {
    return (
      <PageState
        message="Unable to load your account"
        detail={profileState.message}
      />
    );
  }

  const currentProfile =
    profileState.status === "authenticated" ? profileState.profile : null;

  if (
    !currentProfile ||
    (currentProfile.role !== "campus_manager" &&
      currentProfile.role !== "super_admin")
  ) {
    return <PageState message="Redirecting to dashboard..." loading />;
  }

  const visibleImports = imports.filter((importRecord) => {
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      importRecord.file_name.toLowerCase().includes(searchValue) ||
      importRecord.id.toLowerCase().includes(searchValue);
    const matchesStatus =
      statusFilter === "all" || importRecord.status === statusFilter;
    const matchesWeek =
      weekFilter === "all" || importRecord.week_id === weekFilter;
    return matchesSearch && matchesStatus && matchesWeek;
  });
  const weeks = Array.from(
    new Map(imports.map((item) => [item.week_id, item])).values(),
  ).sort(
    (left, right) =>
      (left.academic_year ?? 0) - (right.academic_year ?? 0) ||
      (left.week_number ?? 0) - (right.week_number ?? 0),
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
      <div className="mb-8 pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-text">
          Data management
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
          Import History
        </h1>
        <p className="mt-2 text-sm text-muted">
          Review uploaded weekly CSV imports for your university.
        </p>
      </div>

      {currentProfile.role === "super_admin" && (
        <label className="mb-5 flex max-w-md flex-col gap-1.5 text-xs font-semibold text-ink-2">
          University
          <select
            value={selectedUniversityId}
            onChange={(event) => {
              setSelectedUniversityId(event.target.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
          >
            {universities.map((university) => (
              <option key={university.id} value={university.id}>
                {university.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-6 grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_150px]">
        <label className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2.5 text-sm text-muted">
          <Search size={16} />
          <span className="sr-only">Search imports</span>
          <input
            className="min-w-0 flex-1 outline-none"
            placeholder="Search file name or import ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>Status</span>
          <select
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-2 outline-none focus:border-action"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="imported">Imported</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="validated">Validated</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>Week</span>
          <select
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-2 outline-none focus:border-action"
            value={weekFilter}
            onChange={(event) => setWeekFilter(event.target.value)}
          >
            <option value="all">All weeks</option>
            {weeks.map((week) => (
              <option key={week.week_id} value={week.week_id}>
                {formatWeekLabel(week)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-brand-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-brand-text">
            Unable to load import history
          </p>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      ) : isLoading ? (
        <PanelSkeleton rows={6} label="Loading import history" />
      ) : imports.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-sm">
          <p className="text-lg font-bold">No imports yet</p>
          <p className="mt-2 text-sm text-muted">
            Uploaded weekly CSV files will appear here.
          </p>
        </div>
      ) : visibleImports.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-sm">
          <p className="text-lg font-bold">No matching imports</p>
          <p className="mt-2 text-sm text-muted">
            Try a different search or filter.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-6 py-3 font-semibold">File name</th>
                  <th className="px-4 py-3 font-semibold">Import ID</th>
                  <th className="px-4 py-3 font-semibold">Academic year</th>
                  <th className="px-4 py-3 font-semibold">Week</th>
                  <th className="px-4 py-3 font-semibold">Rows</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Uploaded</th>
                  <th className="px-6 py-3 font-semibold">Current</th>
                  <th className="px-6 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleImports.map((importRecord) => (
                  <tr
                    key={importRecord.id}
                    className={importRecord.is_current ? "bg-brand-soft" : ""}
                  >
                    <td className="max-w-[280px] truncate px-6 py-4 font-semibold">
                      {importRecord.file_name}
                    </td>
                    <td
                      className="px-4 py-4 font-mono text-xs text-muted"
                      title={importRecord.id}
                    >
                      {shortId(importRecord.id)}
                    </td>
                    <td className="px-4 py-4 text-ink-2">
                      {importRecord.academic_year ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-ink-2">
                      {importRecord.week_number ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-ink-2">
                      {importRecord.row_count}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          importRecord.status === "imported"
                            ? "bg-success-soft text-success-text"
                            : importRecord.status === "failed"
                              ? "bg-brand-soft text-brand-text"
                              : "bg-warning-soft text-warning-text"
                        }`}
                      >
                        {formatStatus(importRecord.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted">
                      {new Date(importRecord.uploaded_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {importRecord.is_current ? (
                        <span className="inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-text">
                          Current
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-muted">
                          Historical
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/imports/${importRecord.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-2 transition hover:border-action hover:text-brand-text"
                      >
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-line px-6 py-4">
              <p className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    setPagination((current) => ({
                      ...current,
                      page: current.page - 1,
                    }))
                  }
                  className="rounded-lg border border-line-strong p-2 text-ink-2 transition hover:border-action hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() =>
                    setPagination((current) => ({
                      ...current,
                      page: current.page + 1,
                    }))
                  }
                  className="rounded-lg border border-line-strong p-2 text-ink-2 transition hover:border-action hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
