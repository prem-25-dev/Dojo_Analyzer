"use client";

import { useEffect, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { PanelSkeleton } from "@/components/ui/skeleton";

type AuditRow = {
  actor: string;
  action: string;
  target_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getCurrentUserProfile().then(async (profile) => {
      setLoading(profile.status === "authenticated" && profile.profile.role === "super_admin");
      if (
        profile.status !== "authenticated" ||
        profile.profile.role !== "super_admin"
      ) {
        setMessage("Super Admin access required.");
        return;
      }
      const response = await fetch("/api/super-admin/audit-logs");
      const result = (await response.json()) as {
        logs?: AuditRow[];
        error?: string;
      };
      setLogs(result.logs ?? []);
      setLoading(false);
      setMessage(
        response.ok ? "" : (result.error ?? "Unable to load audit history."),
      );
    });
  }, []);
  return (
    <main className="mx-auto max-w-360 px-4 pb-12 lg:px-8">
      <header className="mb-7 pt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-text">
          Global administration
        </p>
        <h1 className="mt-2 text-3xl font-bold">Audit Logs</h1>
      </header>
      {message && <p className="mb-4 text-sm text-muted">{message}</p>}
      {loading && <PanelSkeleton rows={6} label="Loading audit history" />}
      <div className="divide-y divide-line border-y border-line-strong bg-surface">
        {logs.map((log, index) => (
          <article
            key={`${log.created_at}:${index}`}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-semibold">{log.action.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted">
                {log.actor} · {log.target_type}
              </p>
            </div>
            <time className="text-xs text-muted">
              {new Date(log.created_at).toLocaleString()}
            </time>
          </article>
        ))}
        {!logs.length && !message && !loading && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No audit events recorded.
          </p>
        )}
      </div>
    </main>
  );
}
