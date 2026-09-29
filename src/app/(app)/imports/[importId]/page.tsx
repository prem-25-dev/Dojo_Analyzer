"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Download } from "lucide-react";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/auth/profile";
import { PageState } from "@/components/ui/skeleton";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";

type ImportMetadata = {
  id: string;
  week_id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  row_count: number;
  is_current: boolean;
  week_number: number | null;
  academic_year: number | null;
};

type ImportError = {
  id: string;
  row_number: number;
  field_name: string;
  error_message: string;
  raw_value: string;
  created_at: string;
};

type RawImportRow = {
  id: string;
  row_number: number;
  source_record_id: string;
  raw_data: Record<string, unknown>;
  created_at: string;
};

type ImportDetailResponse = {
  import: ImportMetadata;
  errors: ImportError[];
  rawRows: RawImportRow[];
  error?: string;
};

export default function ImportDetailPage() {
  const router = useRouter();
  const params = useParams<{ importId: string }>();
  const cachedProfile = useCachedProfile();
  const [profileState, setProfileState] = useState<
    CurrentUserProfile | { status: "loading" }
  >(cachedProfile ?? { status: "loading" });
  const [detail, setDetail] = useState<ImportDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isNotFound, setIsNotFound] = useState(false);

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

    const controller = new AbortController();

    async function loadDetail() {
      setIsLoading(true);
      setError("");
      setIsNotFound(false);

      try {
        const response = await fetch(`/api/imports/${params.importId}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as ImportDetailResponse;

        if (response.status === 404) {
          setIsNotFound(true);
          return;
        }

        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load import details.");
        }

        setDetail(result);
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
            : "Unable to load import details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadDetail();

    return () => controller.abort();
  }, [params.importId, profileState]);

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
    return <PageState message="Import detail access is not authorized" />;
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

  if (isLoading) {
    return <PageState message="Loading import details..." loading />;
  }

  if (isNotFound) {
    return (
      <PageState
        message="Import not found"
        detail="This import does not exist or is not available to your university."
      >
        <BackLink />
      </PageState>
    );
  }

  if (error || !detail) {
    return (
      <PageState
        message="Unable to load import details"
        detail={error || "No import details were returned."}
      >
        <BackLink />
      </PageState>
    );
  }

  const errorRows = detail.errors.map((item) => ({
    row: item.row_number,
    student: getRawValue(detail.rawRows, item.row_number, "student_name"),
    field: item.field_name,
    problem: item.error_message,
    rawValue: item.raw_value,
  }));

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 lg:px-8">
      <div className="mb-8 pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-text">
          Data management
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
          Import Details
        </h1>
        <p className="mt-2 text-sm text-muted">
          Review the uploaded file and its preserved validation data.
        </p>
      </div>

      <section className="mb-8 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-5 border-b border-line pb-6 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              File name
            </p>
            <h2 className="mt-2 break-words text-xl font-bold">
              {detail.import.file_name}
            </h2>
          </div>
          <ImportState
            isCurrent={detail.import.is_current}
            status={detail.import.status}
          />
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetadataItem
            label="Academic year"
            value={detail.import.academic_year ?? "-"}
          />
          <MetadataItem label="Week" value={detail.import.week_number ?? "-"} />
          <MetadataItem label="Rows" value={detail.import.row_count} />
          <MetadataItem
            label="Uploaded"
            value={new Date(detail.import.uploaded_at).toLocaleString()}
          />
          <MetadataItem label="Import ID" value={shortId(detail.import.id)} />
          <MetadataItem
            label="Validation errors"
            value={detail.errors.length}
          />
        </dl>
      </section>

      <div
        className={`mb-8 rounded-2xl border p-5 shadow-sm ${detail.import.is_current ? "border-success-line bg-success-soft" : "border-line bg-surface"}`}
      >
        <p className="text-sm font-bold">
          {detail.import.is_current
            ? "Current import version"
            : "Historical import version"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {detail.import.is_current
            ? "This is the active import used for this week."
            : "This version is preserved for audit history and is not the active import."}
        </p>
      </div>

      {detail.errors.length > 0 ? (
        <DetailSection
          title="Validation Errors"
          count={detail.errors.length}
          emptyMessage="No validation errors"
        >
          <>
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-ink-2 hover:border-action hover:text-brand-text"
                onClick={() =>
                  downloadErrorReport(detail.import.file_name, errorRows)
                }
              >
                <Download size={15} /> Download error report
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Row</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Field</th>
                    <th className="px-4 py-3 font-semibold">Problem</th>
                    <th className="px-6 py-3 font-semibold">Raw value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.errors.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 font-semibold">
                        {item.row_number}
                      </td>
                      <td className="px-4 py-4 text-ink-2">
                        {getRawValue(
                          detail.rawRows,
                          item.row_number,
                          "student_name",
                        )}
                      </td>
                      <td className="px-4 py-4 text-ink-2">
                        {item.field_name}
                      </td>
                      <td className="max-w-[360px] whitespace-normal px-4 py-4 text-ink-2">
                        {item.error_message}
                      </td>
                      <td className="max-w-[280px] whitespace-pre-wrap break-words px-6 py-4 text-muted">
                        {item.raw_value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        </DetailSection>
      ) : null}

      {detail.import.status === "imported" ? (
        <DetailSection
          title="Imported Student Records"
          count={detail.rawRows.length}
          emptyMessage="No imported student records"
        >
          {detail.rawRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Squad</th>
                    <th className="px-4 py-3 font-semibold">Initial belts</th>
                    <th className="px-6 py-3 font-semibold">Final belts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.rawRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-4 font-semibold">
                        {getRawValue([row], row.row_number, "student_name")}
                      </td>
                      <td className="px-4 py-4 text-muted">
                        {getRawValue([row], row.row_number, "email")}
                      </td>
                      <td className="px-4 py-4">
                        {getRawValue([row], row.row_number, "squad_number")}
                      </td>
                      <td className="max-w-[260px] whitespace-pre-wrap break-words px-4 py-4 text-xs text-muted">
                        {getRawValue(
                          [row],
                          row.row_number,
                          "initial_belt_levels",
                        )}
                      </td>
                      <td className="max-w-[260px] whitespace-pre-wrap break-words px-6 py-4 text-xs text-muted">
                        {getRawValue(
                          [row],
                          row.row_number,
                          "final_belt_levels",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      <DetailSection
        title="Raw Import Rows"
        count={detail.rawRows.length}
        emptyMessage="No raw import rows"
      >
        {detail.rawRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-6 py-3 font-semibold">Row</th>
                  <th className="px-4 py-3 font-semibold">Source record ID</th>
                  <th className="px-6 py-3 font-semibold">
                    Original CSV values
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.rawRows.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 align-top font-semibold">
                      {item.row_number}
                    </td>
                    <td className="max-w-[220px] break-words px-4 py-4 align-top text-ink-2">
                      {item.source_record_id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="grid max-w-4xl gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(item.raw_data).map(([field, value]) => (
                          <div key={field} className="min-w-0">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                              {field}
                            </p>
                            <p className="break-words text-ink-2">
                              {formatRawValue(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DetailSection>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/imports"
      className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-2 transition hover:border-action hover:text-brand-text"
    >
      ← Import History
    </Link>
  );
}

function MetadataItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold text-ink-2">
        {value}
      </dd>
    </div>
  );
}

function ImportState({
  isCurrent,
  status,
}: {
  isCurrent: boolean;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          status === "imported"
            ? "bg-success-soft text-success-text"
            : status === "failed"
              ? "bg-brand-soft text-brand-text"
              : "bg-warning-soft text-warning-text"
        }`}
      >
        {status}
      </span>
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          isCurrent
            ? "bg-success-soft text-success-text"
            : "bg-sunken text-muted"
        }`}
      >
        {isCurrent ? "Current" : "Superseded"}
      </span>
    </div>
  );
}

function DetailSection({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-xs font-semibold text-muted">
          {count > 0
            ? `${count} record${count === 1 ? "" : "s"}`
            : emptyMessage}
        </span>
      </div>
      {count > 0 ? (
        children
      ) : (
        <p className="px-6 py-8 text-sm text-muted">{emptyMessage}</p>
      )}
    </section>
  );
}

function formatRawValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "-";
  }

  return JSON.stringify(value);
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function getRawValue(
  rawRows: RawImportRow[],
  rowNumber: number,
  field: string,
) {
  const value = rawRows.find((row) => row.row_number === rowNumber)?.raw_data[
    field
  ];
  return formatRawValue(value);
}

function downloadErrorReport(
  fileName: string,
  errors: Array<{
    row: number;
    student: string;
    field: string;
    problem: string;
    rawValue: string;
  }>,
) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [
    "Row,Student,Field,Problem",
    ...errors.map((error) =>
      [error.row, error.student, error.field, error.problem]
        .map((value) => escape(String(value)))
        .join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName.replace(/\.csv$/i, "")}-errors.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

