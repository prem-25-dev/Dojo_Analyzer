"use client";

import { Fragment, useEffect, useState } from "react";
import { Building2, Pencil, Plus, Save, X } from "lucide-react";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { PanelSkeleton } from "@/components/ui/skeleton";

type University = {
  id: string;
  name: string;
  student_count: number;
  squad_count: number;
  mentor_count: number;
  campus_manager_count: number;
};

export default function UniversitiesPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    squads: Array<{ squad_number: string }>;
    users: Array<{ full_name: string | null; role: string }>;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/super-admin/universities");
    const result = (await response.json()) as {
      universities?: University[];
      error?: string;
    };
    if (!response.ok)
      setMessage(result.error ?? "Unable to load universities.");
    else setUniversities(result.universities ?? []);
    setLoading(false);
  }

  useEffect(() => {
    getCurrentUserProfile().then((profile) => {
      if (
        profile.status !== "authenticated" ||
        profile.profile.role !== "super_admin"
      )
        setMessage("Super Admin access required.");
      else void load();
    });
  }, []);

  async function createUniversity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/super-admin/universities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      setMessage(result.error ?? "Unable to create university.");
    else {
      setName("");
      setMessage("University added.");
      await load();
    }
  }

  async function saveUniversity(id: string) {
    const response = await fetch(`/api/super-admin/universities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      setMessage(result.error ?? "Unable to update university.");
    else {
      setEditing(null);
      setMessage("University updated.");
      await load();
    }
  }

  async function toggleDetails(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    const response = await fetch(`/api/super-admin/universities/${id}`);
    const result = (await response.json()) as {
      squads?: Array<{ squad_number: string }>;
      users?: Array<{ full_name: string | null; role: string }>;
      error?: string;
    };
    if (!response.ok) {
      setMessage(result.error ?? "Unable to load university details.");
      return;
    }
    setDetail({ squads: result.squads ?? [], users: result.users ?? [] });
    setExpanded(id);
  }

  return (
    <main className="mx-auto max-w-360 px-4 pb-12 lg:px-8">
      <header className="mb-7 pt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-text">
          Global administration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">Universities</h1>
      </header>
      <form
        onSubmit={createUniversity}
        className="mb-6 flex flex-wrap items-end gap-3 border-b border-line-strong pb-6"
      >
        <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-xs font-semibold text-ink-2">
          University name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
          />
        </label>
        <button className="inline-flex items-center gap-2 rounded-lg bg-action-hover px-4 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} />
          Add university
        </button>
      </form>
      {message && (
        <p className="mb-4 text-sm text-ink-2" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <PanelSkeleton rows={6} label="Loading universities" />
      ) : (
        <div className="overflow-x-auto border-y border-line-strong">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sunken text-xs uppercase text-ink-2">
              <tr>
                <th className="px-4 py-3">University</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Squads</th>
                <th className="px-4 py-3">Mentors</th>
                <th className="px-4 py-3">Campus managers</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {universities.map((university) => (
                <Fragment key={university.id}>
                  <tr>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {editing === university.id ? (
                        <input
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          className="rounded border px-2 py-1"
                        />
                      ) : (
                        university.name
                      )}
                    </td>
                    <td className="px-4 py-3">{university.student_count}</td>
                    <td className="px-4 py-3">{university.squad_count}</td>
                    <td className="px-4 py-3">{university.mentor_count}</td>
                    <td className="px-4 py-3">
                      {university.campus_manager_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {editing === university.id ? (
                          <>
                            <button
                              type="button"
                              title="Save university name"
                              onClick={() => void saveUniversity(university.id)}
                              className="p-2 text-success-text"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              type="button"
                              title="Cancel editing"
                              onClick={() => setEditing(null)}
                              className="p-2 text-muted"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            title="Edit university name"
                            onClick={() => {
                              setEditing(university.id);
                              setEditName(university.name);
                            }}
                            className="p-2 text-muted"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleDetails(university.id)}
                          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-2.5 py-1.5 text-xs font-semibold"
                        >
                          <Building2 size={14} />
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === university.id && detail && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-4">
                        <div className="grid gap-5 border-t border-line pt-4 md:grid-cols-2">
                          <div>
                            <h2 className="font-semibold">Squads</h2>
                            <p className="mt-1 text-sm text-muted">
                              {detail.squads
                                .map((squad) => squad.squad_number)
                                .join(", ") || "No squads yet"}
                            </p>
                          </div>
                          <div>
                            <h2 className="font-semibold">Campus team</h2>
                            <p className="mt-1 text-sm text-muted">
                              {detail.users
                                .map(
                                  (user) =>
                                    `${user.full_name ?? "Unnamed"} (${user.role === "mentor" ? "Mentor" : "Campus Manager"})`,
                                )
                                .join(", ") ||
                                "No assigned mentors or campus managers"}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!universities.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-muted"
                  >
                    No universities found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
