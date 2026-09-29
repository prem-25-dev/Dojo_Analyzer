"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import Papa from "papaparse";
import { formatWeekLabel } from "@/lib/weeks";

type UploadState =
  | "idle"
  | "previewing"
  | "ready"
  | "uploading"
  | "success"
  | "error";

type WeekGroupResult = {
  week_id: string;
  week_number: number;
  academic_year: number;
  start_date: string;
  end_date: string;
  row_count: number;
  squads: string[];
  import_id?: string | null;
  imported?: boolean;
};

type ImportSummary = {
  rows: number;
  weeks: number;
  squads: number;
  studentsCreated: number;
  existingStudents: number;
  membershipsCreated: number;
  errors: number;
};

type ImportPreviewError = {
  row_number: number;
  error_message: string;
  week_id?: string | null;
  week_number?: number | null;
  academic_year?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

type ImportResponse = {
  error?: string;
  message?: string;
  status?: string;
  totalRows?: number;
  importedRows?: number;
  errorRows?: number;
  missingColumns?: string[];
  details?: unknown;
  rowResults?: ImportRowResult[];
  summary?: ImportSummary;
  weeks?: WeekGroupResult[];
  errors?: ImportPreviewError[];
  sourceRowCount?: number;
};

type ImportRowResult = {
  row_number: number;
  student_name: string;
  squad_number: string;
  student_status: "created" | "existing" | "not_created";
  membership_status:
    | "added"
    | "already_in_squad"
    | "another_squad"
    | "squad_not_found"
    | "not_added";
  other_squad_number: string | null;
  belt_import_status: "imported" | "validation_error" | "not_imported";
  errors: string[];
};

type PreviewRow = {
  row_number: number;
  student_name: string;
  email: string;
  squad_number: string;
};

type University = { id: string; name: string };

type CsvUploadDialogProps = {
  open: boolean;
  onClose: () => void;
  requireUniversity: boolean;
  mode?: "weekly-import" | "manage-squads";
  onComplete?: () => void;
  defaultAcademicYear?: number;
};

function academicYearOptions(selected: number) {
  const current = new Date().getFullYear();
  return Array.from(new Set([current - 1, current, current + 1, selected])).sort(
    (left, right) => left - right,
  );
}

function formatImportError(result: ImportResponse) {
  const parts = [result.error ?? "Upload failed. Please check the CSV and try again."];
  if (result.missingColumns?.length) {
    parts.push(`Missing columns: ${result.missingColumns.join(", ")}`);
  }
  if (typeof result.errorRows === "number" && result.errorRows > 0) {
    parts.push(`${result.errorRows} validation error(s).`);
  }
  return parts.join(" ");
}

export function CsvUploadDialog({
  open,
  onClose,
  requireUniversity,
  mode = "weekly-import",
  onComplete,
  defaultAcademicYear = new Date().getFullYear(),
}: CsvUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [universityId, setUniversityId] = useState("");
  const [universities, setUniversities] = useState<University[]>([]);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [rowResults, setRowResults] = useState<ImportRowResult[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewRowCount, setPreviewRowCount] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportResponse | null>(null);
  const [loadingUniversities, setLoadingUniversities] = useState(
    requireUniversity,
  );

  useEffect(() => {
    if (!open || !requireUniversity) {
      return;
    }

    const controller = new AbortController();
    fetch("/api/super-admin/universities", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          universities?: University[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load universities.");
        }
        const options = result.universities ?? [];
        setUniversities(options);
        setUniversityId(options[0]?.id ?? "");
        if (!options.length) {
          setState("error");
          setMessage("No universities available for import.");
        }
      })
      .catch((loadError) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }
        setState("error");
        setMessage(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load universities.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingUniversities(false);
      });

    return () => controller.abort();
  }, [open, requireUniversity]);

  if (!open) return null;

  const isPending = state === "previewing" || state === "uploading";
  const isUploading = state === "uploading";
  const isSuccess = state === "success";
  const isManageSquads = mode === "manage-squads";
  const submitDisabled =
    isPending ||
    loadingUniversities ||
    (requireUniversity && !universityId) ||
    (!isManageSquads && (!file || importPreview?.status === "invalid")) ||
    (isManageSquads && (Boolean(previewError) || previewRows.length === 0));

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setState("idle");
    setMessage("");
    setRowResults([]);
    setImportPreview(null);
    setPreviewRows([]);
    setPreviewRowCount(0);
    setPreviewError("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const isCsv =
      selectedFile.name.toLowerCase().endsWith(".csv") ||
      selectedFile.type === "text/csv";

    if (!isCsv) {
      setFile(null);
      setState("error");
      setMessage("Please select a CSV file.");
      return;
    }

    setFile(selectedFile);
    if (!isManageSquads) return;

    try {
      const parsed = Papa.parse<Record<string, string>>(
        await selectedFile.text(),
        { header: true, skipEmptyLines: true },
      );
      const requiredColumns = [
        "id",
        "start_time",
        "calculated_end_time",
        "belt_test_updated_at",
        "student_name",
        "email",
        "squad_number",
        "initial_belt_levels",
        "final_belt_levels",
      ];
      const missingColumns = requiredColumns.filter(
        (column) => !parsed.meta.fields?.includes(column),
      );

      if (parsed.errors.length > 0) {
        setPreviewError(`CSV parsing failed: ${parsed.errors[0].message}`);
        return;
      }
      if (missingColumns.length > 0) {
        setPreviewError(`Missing required columns: ${missingColumns.join(", ")}`);
        return;
      }
      if (parsed.data.length === 0) {
        setPreviewError("CSV contains no rows.");
        return;
      }

      const distinctRows = new Map<string, PreviewRow>();
      parsed.data.forEach((row, index) => {
        const email = row.email?.trim().toLowerCase() ?? "";
        const key = email || `missing-email:${index + 2}`;
        if (!distinctRows.has(key)) {
          distinctRows.set(key, {
            row_number: index + 2,
            student_name: row.student_name ?? "",
            email,
            squad_number: row.squad_number ?? "",
          });
        }
      });
      const students = [...distinctRows.values()];
      setPreviewRowCount(students.length);
      setPreviewRows(students.slice(0, 5));
    } catch {
      setPreviewError("Unable to read the selected CSV file.");
    }
  }

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setState("error");
      setMessage("Select a CSV file before uploading.");
      return;
    }

    if (requireUniversity && !universityId) {
      setState("error");
      setMessage("Select a university before uploading.");
      return;
    }
    if (!isManageSquads && (!Number.isInteger(academicYear) || academicYear < 2000)) {
      setState("error");
      setMessage("Select a valid academic year before importing.");
      return;
    }
    const shouldCommitMultiWeek =
      !isManageSquads &&
      importPreview?.status === "preview" &&
      (importPreview.errors?.length ?? 0) === 0;
    setState(
      isManageSquads || shouldCommitMultiWeek ? "uploading" : "previewing",
    );
    setMessage("");
    if (isManageSquads) setRowResults([]);

    const formData = new FormData();
    formData.append("file", file);
    if (isManageSquads) {
      formData.append("provisionStudentsOnly", "true");
    } else {
      formData.append("academicYear", String(academicYear));
      formData.append(
        "multiWeekAction",
        shouldCommitMultiWeek ? "commit" : "preview",
      );
    }
    if (requireUniversity) {
      formData.append("university_id", universityId);
    }

    try {
      console.info("[csv-upload] POST /api/import", {
        fileName: file.name,
        multiWeekAction: shouldCommitMultiWeek ? "commit" : "preview",
        hasUniversityId: requireUniversity,
      });

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      let result: ImportResponse = {};
      try {
        result = (await response.json()) as ImportResponse;
      } catch {
        throw new Error(
          `Upload failed with status ${response.status}. The server did not return JSON.`,
        );
      }

      console.info("[csv-upload] /api/import response", {
        ok: response.ok,
        status: response.status,
        importStatus: result.status,
        error: result.error,
        errorRows: result.errorRows,
      });

      if (!response.ok) {
        throw new Error(formatImportError(result));
      }

      if (!isManageSquads) {
        setImportPreview(result);
        setRowResults(result.rowResults ?? []);
        if (shouldCommitMultiWeek && result.status === "imported") {
          setState("success");
          setMessage("Import successful");
          onComplete?.();
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
        if (result.status === "invalid") {
          setState("error");
          setMessage("CSV cannot be imported. Resolve the validation errors below.");
          return;
        }
        setState("ready");
        setMessage("CSV validated. Review the week groups, then import.");
        return;
      }

      setRowResults(result.rowResults ?? []);
      onComplete?.();
      if (result.status === "failed") {
        setState("error");
        setMessage(
          isManageSquads
            ? `Student provisioning completed with ${result.errorRows ?? 0} error(s).`
            : `Import failed: ${result.errorRows ?? 0} row(s) need attention.`,
        );
        return;
      }

      setState("success");
      setMessage(
        isManageSquads
          ? `Provisioning completed: ${result.importedRows ?? 0} of ${result.totalRows ?? 0} unique students processed.`
          : `Import completed: ${result.importedRows ?? 0} of ${result.totalRows ?? 0} rows imported (${result.status ?? "completed"}).`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (uploadError) {
      console.error("[csv-upload] upload failed", {
        message:
          uploadError instanceof Error ? uploadError.message : "unknown",
      });
      setState("error");
      setMessage(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-6 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
    >
      <div className="max-h-[calc(100vh-4rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-text">
              {mode === "manage-squads" ? "Manage squads" : "Weekly imports"}
            </p>
            <h2 id="upload-dialog-title" className="mt-2 text-xl font-bold">
              {mode === "manage-squads"
                ? "Add Students from CSV"
                : "Import Belt CSV"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {mode === "manage-squads"
                ? "Upload the existing belt CSV to create missing students and assign them to their squads."
                : "Each row’s record date determines its academic week. Review all week groups before importing."}
            </p>
          </div>
          <button
            className="rounded-lg p-2 text-muted transition hover:bg-page hover:text-ink"
            type="button"
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close upload dialog"
          >
            <X size={18} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileSelected}
        />

        <form className="mt-6 space-y-5" onSubmit={submitUpload}>
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Selected file
                </p>
                <p className="mt-2 truncate text-sm font-semibold">
                  {file ? file.name : "No CSV selected"}
                </p>
              </div>
              <button
                className="shrink-0 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-2 transition hover:border-action hover:text-brand-text"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                Choose CSV
              </button>
            </div>
          </div>

          {isManageSquads && previewError && (
            <p className="rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-brand-text" role="alert">
              {previewError}
            </p>
          )}

          {isManageSquads && previewRows.length > 0 && rowResults.length === 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">
                CSV preview · {previewRowCount} unique students · showing {previewRows.length}
              </p>
              <div className="max-h-48 overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Student</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-3 py-2 font-semibold">Squad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {previewRows.map((row) => (
                      <tr key={row.row_number}>
                        <td className="px-3 py-2 font-medium">{row.student_name || "—"}</td>
                        <td className="px-3 py-2 text-muted">{row.email || "—"}</td>
                        <td className="px-3 py-2">{row.squad_number || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {requireUniversity && (
            <label className="space-y-2 text-sm font-semibold block">
              <span>University</span>
              <select
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 font-normal outline-none focus:border-action"
                value={universityId}
                onChange={(event) => setUniversityId(event.target.value)}
                disabled={isUploading || loadingUniversities}
                required
              >
                {universities.length === 0 ? (
                  <option value="">No universities</option>
                ) : null}
                {universities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!isManageSquads && (
            <label className="block space-y-2 text-sm font-semibold">
              <span>Academic year</span>
              <select
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 font-normal outline-none focus:border-action"
                value={academicYear}
                onChange={(event) => {
                  setAcademicYear(Number(event.target.value));
                  setImportPreview(null);
                  setRowResults([]);
                  setState("idle");
                }}
                disabled={isPending}
              >
                {academicYearOptions(academicYear).map((year) => (
                  <option key={year} value={year}>
                    {year}–{String(year + 1).slice(-2)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!isManageSquads && importPreview?.summary && (
            <section className="space-y-3" aria-live="polite">
              <div>
                <h3 className="text-sm font-bold">
                  {importPreview.status === "imported"
                    ? "Import successful"
                    : importPreview.status === "invalid"
                      ? "CSV cannot be imported"
                      : "CSV detected"}
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-surface-2 p-3 text-xs sm:grid-cols-4">
                  <SummaryItem label="Records" value={importPreview.summary.rows} />
                  <SummaryItem label="Weeks" value={importPreview.summary.weeks} />
                  <SummaryItem label="Squads" value={importPreview.summary.squads} />
                  <SummaryItem
                    label={importPreview.status === "imported" ? "Students created" : "New students"}
                    value={importPreview.summary.studentsCreated}
                  />
                  <SummaryItem label="Existing students" value={importPreview.summary.existingStudents} />
                  <SummaryItem
                    label={importPreview.status === "imported" ? "Memberships created" : "Memberships to add"}
                    value={importPreview.summary.membershipsCreated}
                  />
                  <SummaryItem label="Errors" value={importPreview.summary.errors} />
                </dl>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {importPreview.weeks?.map((week) => (
                  <div
                    key={week.week_id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-1 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-ink-2">
                        {formatWeekLabel(week)}
                      </p>
                      <p className="text-xs text-muted">
                        Squads: {week.squads.join(", ") || "—"}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-ink-2">
                      {week.imported
                        ? `✓ ${week.row_count} records`
                        : `${week.row_count} records`}
                    </p>
                  </div>
                ))}
              </div>

              {importPreview.errors && importPreview.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-brand-line bg-brand-soft p-3">
                  <ul className="space-y-2 text-xs text-brand-text">
                    {importPreview.errors.map((error, index) => (
                      <li key={`${error.row_number}:${index}`}>
                        <p className="font-semibold">
                          {error.week_number && error.start_date && error.end_date
                            ? `${formatWeekLabel({
                                week_number: error.week_number,
                                start_date: error.start_date,
                                end_date: error.end_date,
                              })} · `
                            : ""}
                          Row {error.row_number}
                        </p>
                        <p>{error.error_message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {message && (
            <p
              className={`rounded-lg px-3 py-2.5 text-sm ${
                state === "success"
                  ? "bg-success-soft text-success-text"
                  : "bg-brand-soft text-brand-text"
              }`}
              role="status"
            >
              {message}
            </p>
          )}

          {isManageSquads && rowResults.length > 0 && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-3 text-xs sm:grid-cols-3">
                <SummaryItem label="Unique students" value={rowResults.length} />
                <SummaryItem label="Students created" value={rowResults.filter((row) => row.student_status === "created").length} />
                <SummaryItem label="Existing students" value={rowResults.filter((row) => row.student_status === "existing").length} />
                <SummaryItem label="Memberships created" value={rowResults.filter((row) => row.membership_status === "added").length} />
                <SummaryItem label="Already assigned" value={rowResults.filter((row) => row.membership_status === "already_in_squad" || row.membership_status === "another_squad").length} />
                <SummaryItem label="Errors" value={rowResults.filter((row) => row.errors.length > 0).length} />
              </dl>
              <div className="max-h-64 overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Student</th>
                      <th className="px-3 py-2 font-semibold">Squad</th>
                      <th className="px-3 py-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                {rowResults.map((row) => {
                  const studentLabel =
                    row.student_status === "created"
                      ? "Created student"
                      : row.student_status === "existing"
                        ? "Existing student"
                        : "Student not created";
                  const membershipLabel =
                    row.membership_status === "added"
                      ? `added to Squad ${row.squad_number}`
                      : row.membership_status === "already_in_squad"
                        ? `already in Squad ${row.squad_number}`
                        : row.membership_status === "another_squad"
                          ? `already belongs to Squad ${row.other_squad_number ?? "another squad"}`
                          : row.membership_status === "squad_not_found"
                            ? "Squad not found"
                            : "Squad membership unchanged";
                  return (
                    <tr key={row.row_number}>
                      <td className="px-3 py-2 font-medium">{row.student_name}</td>
                      <td className="px-3 py-2">{row.squad_number}</td>
                      <td className="px-3 py-2">
                        <span className={row.errors.length ? "text-brand-text" : "text-ink-2"}>
                          {studentLabel} + {membershipLabel}
                        </span>
                        {row.errors.length > 0 && (
                          <p className="mt-1 text-brand-text">{row.errors.join("; ")}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isManageSquads && rowResults.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
              <ul className="divide-y divide-line">
                {rowResults.map((row) => (
                  <li key={row.row_number} className="px-3 py-2.5 text-sm">
                    <p className="font-semibold text-ink-2">
                      Row {row.row_number} | {row.student_name} | {row.student_status === "created" ? "Created student" : row.student_status === "existing" ? "Existing student" : "Student not created"} + {row.membership_status === "added" ? `added to Squad ${row.squad_number}` : row.membership_status === "already_in_squad" ? `already in Squad ${row.squad_number}` : row.membership_status === "another_squad" ? `already belongs to Squad ${row.other_squad_number ?? "another squad"}` : row.membership_status === "squad_not_found" ? "Squad not found" : "Squad membership unchanged"} | {row.belt_import_status === "imported" ? "Belt import successful" : row.belt_import_status === "validation_error" ? "Validation error" : "Not imported"}
                    </p>
                    {row.errors.length > 0 && (
                      <p className="mt-1 text-xs text-brand-text">
                        {row.errors.join("; ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <button
              className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-page"
              type="button"
              onClick={handleClose}
              disabled={isPending}
            >
              {isSuccess ? "Close" : "Cancel"}
            </button>
            {!isSuccess && (
              <button
                className="rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={submitDisabled}
              >
                {state === "previewing"
                  ? "Validating..."
                  : isUploading
                    ? "Importing..."
                    : isManageSquads
                      ? "Import CSV"
                      : importPreview?.status === "preview"
                        ? "Import"
                        : "Preview & Validate"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-bold text-ink-2">{value}</dd>
    </div>
  );
}
