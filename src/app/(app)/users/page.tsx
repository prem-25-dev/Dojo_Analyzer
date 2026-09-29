"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import { PanelSkeleton } from "@/components/ui/skeleton";

type Role = "super_admin" | "campus_manager" | "mentor" | "student";
type UserRow = {
  email: string;
  full_name: string | null;
  role: Role;
  university_id: string | null;
  university_name: string | null;
  student_id: string | null;
  student_name: string | null;
  status: "active" | "pending";
};
type Option = { id: string; name: string | null; email?: string | null };

const labels: Record<Role, string> = {
  super_admin: "Super Admin",
  campus_manager: "Campus Manager",
  mentor: "Mentor",
  student: "Student",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [universities, setUniversities] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("campus_manager");
  const [universityId, setUniversityId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(filters: { search?: string; roleFilter?: string } = {}) {
    const query = new URLSearchParams();
    const activeSearch = filters.search ?? search;
    const activeRole = filters.roleFilter ?? roleFilter;
    if (activeSearch.trim()) query.set("search", activeSearch.trim());
    if (activeRole !== "all") query.set("role", activeRole);
    const response = await fetch(`/api/super-admin/users?${query}`);
    const result = (await response.json()) as {
      users?: UserRow[];
      universities?: Option[];
      students?: Option[];
      error?: string;
    };
    if (!response.ok) setMessage(result.error ?? "Unable to load users.");
    else {
      setUsers(result.users ?? []);
      setUniversities(result.universities ?? []);
      setStudents(result.students ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    getCurrentUserProfile().then(async (profile) => {
      if (
        profile.status !== "authenticated" ||
        profile.profile.role !== "super_admin"
      ) {
        setMessage("Super Admin access required.");
        setLoading(false);
      } else {
        const response = await fetch("/api/super-admin/users");
        const result = (await response.json()) as {
          users?: UserRow[];
          universities?: Option[];
          students?: Option[];
          error?: string;
        };
        if (!response.ok) setMessage(result.error ?? "Unable to load users.");
        else {
          setUsers(result.users ?? []);
          setUniversities(result.universities ?? []);
          setStudents(result.students ?? []);
        }
        setLoading(false);
      }
    });
  }, []);

  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/super-admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: name,
        email,
        role,
        universityId: role === "super_admin" ? null : universityId || null,
        studentId: role === "student" ? studentId || null : null,
      }),
    });
    const result = (await response.json()) as {
      status?: string;
      error?: string;
    };
    if (!response.ok) {
      setMessage(result.error ?? "Unable to assign user.");
      return;
    }
    setMessage(
      result.status === "pending"
        ? "Assignment saved. It will attach when this email first signs in with Google."
        : "User assignment saved.",
    );
    setName("");
    setEmail("");
    setEditingEmail(null);
    setStudentId("");
    await load();
  }

  function editUser(user: UserRow) {
    setName(user.full_name ?? "");
    setEmail(user.email);
    setEditingEmail(user.email);
    setRole(user.role);
    setUniversityId(user.university_id ?? "");
    setStudentId(user.student_id ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-360 px-4 pb-12 lg:px-8">
      <header className="mb-7 pt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-text">
          Global administration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">Users</h1>
      </header>
      <form
        onSubmit={assign}
        className="mb-7 grid gap-3 border-b border-line-strong pb-6 sm:grid-cols-2 xl:grid-cols-5"
      >
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
          Google account email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={editingEmail !== null}
            required
            className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm read-only:bg-sunken"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {role !== "super_admin" && (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
            University
            <select
              value={universityId}
              onChange={(event) => setUniversityId(event.target.value)}
              required
              className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
            >
              <option value="">
                {role === "student" ? "Select university" : "Select university"}
              </option>
              {universities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {role === "student" && (
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-2">
            Student record
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              required
              className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
            >
              <option value="">Select student</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? "Unnamed student"}
                  {item.email ? ` · ${item.email}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center justify-end gap-2 self-end">
          {editingEmail && (
            <button
              type="button"
              onClick={() => {
                setEditingEmail(null);
                setName("");
                setEmail("");
                setStudentId("");
              }}
              className="rounded-lg border border-line-strong px-3 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          )}
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-action-hover px-4 py-2.5 text-sm font-semibold text-white">
            <UserPlus size={16} />
            {editingEmail ? "Update assignment" : "Save assignment"}
          </button>
        </div>
      </form>
      {message && (
        <p className="mb-4 text-sm text-ink-2" role="status">
          {message}
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3">
          <Search size={16} className="text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void load();
              }
            }}
            placeholder="Search name or email"
            className="w-full py-2.5 text-sm outline-none"
          />
        </label>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            void load({ roleFilter: event.target.value });
          }}
          className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm"
        >
          <option value="all">All roles</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          Search
        </button>
      </div>
      {loading ? (
        <PanelSkeleton rows={6} label="Loading users" />
      ) : (
        <div className="overflow-x-auto border-y border-line-strong">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sunken text-xs uppercase text-ink-2">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">University / student</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {users.map((user) => (
                <tr key={`${user.status}:${user.email}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">
                      {user.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">{labels[user.role]}</td>
                  <td className="px-4 py-3">
                    {user.university_name ?? user.student_name ?? "Global"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.status === "active"
                          ? "text-success-text"
                          : "text-warning-text"
                      }
                    >
                      {user.status === "active"
                        ? "Active"
                        : "Pending Google sign-in"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.status === "active" && (
                      <button
                        type="button"
                        onClick={() => editUser(user)}
                        className="rounded border border-line-strong px-2.5 py-1.5 text-xs font-semibold"
                      >
                        Edit assignment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-muted"
                  >
                    No matching users.
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
