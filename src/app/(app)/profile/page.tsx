"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Copy,
  KeyRound,
  LogOut,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import {
  avatarUrlOf,
  clearProfileCache,
  getCurrentUserProfile,
  type UserProfile,
} from "@/lib/auth/profile";
import { supabase } from "@/lib/supabase/client";
import { useCachedProfile } from "@/lib/auth/use-cached-profile";
import { visibleGroups } from "@/components/navigation";
import { setTheme, useTheme } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { PageState } from "@/components/ui/skeleton";
import { SpotlightCard } from "@/components/reactbits/spotlight-card";

type Loaded = { profile: UserProfile; user: User };

function roleLabel(role: UserProfile["role"]) {
  if (role === "super_admin") return "Super Admin";
  if (role === "campus_manager") return "Campus Manager";
  if (role === "mentor") return "Mentor";
  return "Student";
}

const ROLE_BLURB: Record<UserProfile["role"], string> = {
  super_admin: "Full access across every university, user and import.",
  campus_manager: "Runs your campus: squads, students and weekly imports.",
  mentor: "Read access to your campus dashboards, insights and students.",
  student: "Your own belt history and the leaderboards.",
};

function toLoaded(cached: ReturnType<typeof useCachedProfile>): Loaded | null {
  return cached?.status === "authenticated"
    ? { profile: cached.profile, user: cached.user }
    : null;
}

function formatWhen(value: string | undefined | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export default function ProfilePage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const theme = useTheme();
  const cachedProfile = useCachedProfile();
  const [loaded, setLoaded] = useState<Loaded | null>(() => toLoaded(cachedProfile));
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [signOutState, setSignOutState] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let mounted = true;
    getCurrentUserProfile().then((result) => {
      if (!mounted) return;
      if (result.status === "unauthenticated") router.replace("/login");
      else if (result.status === "authenticated")
        setLoaded({ profile: result.profile, user: result.user });
      else setFailed(true);
    });
    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSignOut() {
    setSignOutState("pending");
    setSignOutError("");
    try {
      await supabase.auth.signOut({ scope: "local" });
      clearProfileCache();
      const response = await fetch("/auth/signout", {
        method: "POST",
        redirect: "manual",
      });
      if (!response.ok && response.status !== 0 && response.type !== "opaqueredirect") {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Sign out failed.");
      }
      router.replace("/login");
    } catch (error) {
      setSignOutState("error");
      setSignOutError(
        error instanceof Error ? error.message : "Sign out failed. Please try again.",
      );
    }
  }

  if (failed && !loaded)
    return (
      <PageState
        message="Unable to load profile"
        detail="Your account information could not be retrieved."
      >
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signOutState === "pending"}
          className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-2 transition hover:text-ink disabled:opacity-50"
        >
          {signOutState === "pending" ? "Signing out…" : "Sign out"}
        </button>
      </PageState>
    );
  if (!loaded) return <PageState message="Loading your profile" loading />;

  const { profile, user } = loaded;
  const email = user.email ?? null;
  const photo = avatarUrlOf(user);
  const provider =
    (user.app_metadata?.provider as string | undefined) ?? "email";
  const groups = visibleGroups(profile.role);
  const rise = (index: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: 0.05 * index, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
        };

  function copyEmail() {
    if (!email) return;
    navigator.clipboard
      ?.writeText(email)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 lg:px-8">
      {/* ── Identity hero ─────────────────────────────────── */}
      <motion.section
        {...rise(0)}
        className="relative mt-2 overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]"
      >
        <div className="relative h-36 overflow-hidden sm:h-44">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 120% at 12% 0%, color-mix(in srgb, var(--brand) 38%, transparent), transparent 60%), radial-gradient(50% 120% at 88% 10%, color-mix(in srgb, var(--lang-cpp) 30%, transparent), transparent 60%), radial-gradient(40% 90% at 55% 100%, color-mix(in srgb, var(--lang-python) 26%, transparent), transparent 70%), var(--surface-2)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-50 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />
        </div>
        <div className="relative flex flex-wrap items-end gap-5 px-6 pb-6 sm:px-8">
          <div className="-mt-14 rounded-full bg-surface p-1.5 shadow-[var(--pop-shadow)] sm:-mt-16">
            <Avatar
              src={photo}
              name={profile.full_name}
              seed={profile.id}
              size={112}
            />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-[28px] font-bold tracking-[-0.03em] sm:text-[32px]">
                {profile.full_name ?? "Unnamed user"}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand-text">
                <ShieldCheck size={13} /> {roleLabel(profile.role)}
              </span>
            </div>
            <button
              type="button"
              onClick={copyEmail}
              className="group mt-1 inline-flex items-center gap-1.5 text-[14px] text-muted transition hover:text-ink"
              title="Copy email"
            >
              <Mail size={14} /> {email ?? "No email"}
              <span className="text-faint opacity-0 transition group-hover:opacity-100">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </span>
            </button>
          </div>
          {provider === "google" ? (
            <span className="mb-1 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-2">
              <GoogleMark /> Signed in with Google
            </span>
          ) : null}
        </div>
      </motion.section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* ── Account details ─────────────────────────────── */}
        <motion.section
          {...rise(1)}
          className="rounded-3xl border border-line bg-surface shadow-[var(--card-shadow)]"
        >
          <header className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold">Account</h2>
              <p className="text-[12.5px] text-muted">
                Managed by your administrator.
              </p>
            </div>
            <BadgeCheck size={18} className="text-success-text" />
          </header>
          <dl className="divide-y divide-line">
            <Detail icon={UserRound} label="Display name" value={profile.full_name ?? "—"} />
            <Detail icon={Mail} label="Email" value={email ?? "—"} />
            <Detail
              icon={KeyRound}
              label="Sign-in method"
              value={provider === "google" ? "Google" : provider}
            />
            <Detail
              icon={CalendarClock}
              label="Last signed in"
              value={formatWhen(user.last_sign_in_at)}
            />
            <Detail
              icon={CalendarClock}
              label="Member since"
              value={formatWhen(user.created_at)}
            />
          </dl>
        </motion.section>

        <div className="grid content-start gap-4">
          {/* ── Role & access ───────────────────────────────── */}
          <motion.div {...rise(2)}>
            <SpotlightCard className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-text">
                Your access
              </p>
              <p className="mt-1.5 text-[14px] leading-6 text-ink-2">
                {ROLE_BLURB[profile.role]}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {groups.flatMap((group) =>
                  group.tabs.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:border-ink/30 hover:text-ink"
                    >
                      <tab.icon size={13} className="text-muted" />
                      {tab.label}
                      <ArrowUpRight
                        size={12}
                        className="-ml-0.5 text-faint transition group-hover:-translate-y-px group-hover:translate-x-px"
                      />
                    </Link>
                  )),
                )}
                {profile.role === "student" ? (
                  <Link
                    href="/student"
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
                  >
                    My belts <ArrowUpRight size={12} />
                  </Link>
                ) : null}
              </div>
            </SpotlightCard>
          </motion.div>

          {/* ── Appearance ──────────────────────────────────── */}
          <motion.section
            {...rise(3)}
            className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[15px] font-semibold">Appearance</h2>
              <span className="text-[12px] text-muted">
                Press{" "}
                <kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[11px]">
                  T
                </kbd>{" "}
                anywhere
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="mt-3 grid grid-cols-2 gap-2"
            >
              {(
                [
                  ["light", Sun, "Light"],
                  ["dark", Moon, "Dark"],
                ] as const
              ).map(([value, Icon, label]) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(value)}
                    className={`relative overflow-hidden rounded-2xl border p-3 text-left transition ${active ? "border-ink" : "border-line hover:border-line-strong"}`}
                  >
                    <span
                      aria-hidden="true"
                      className="mb-2.5 block h-14 rounded-xl border"
                      style={
                        value === "light"
                          ? { background: "linear-gradient(135deg,#ffffff,#f4f3f1)", borderColor: "#e6e4e0" }
                          : { background: "linear-gradient(135deg,#1b1b20,#0e0e10)", borderColor: "#27272d" }
                      }
                    >
                      <span
                        className="m-2 block h-2 w-10 rounded-full"
                        style={{ background: value === "light" ? "#141414" : "#f4f4f5", opacity: 0.8 }}
                      />
                      <span className="mx-2 block h-1.5 w-6 rounded-full bg-[#ef3837]" />
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Icon size={14} /> {label}
                    </span>
                    {active ? (
                      <motion.span
                        layoutId="theme-check"
                        className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-page"
                      >
                        <Check size={12} strokeWidth={3} />
                      </motion.span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </motion.section>

          {/* ── Sign out ────────────────────────────────────── */}
          <motion.section
            {...rise(4)}
            className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]"
          >
            <h2 className="font-display text-[15px] font-semibold">Session</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Signing out ends your session on this device.
            </p>
            <AnimatePresence mode="wait" initial={false}>
              {confirming ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-4 flex flex-wrap items-center gap-2"
                >
                  <span className="mr-auto text-[13px] font-semibold">Sign out now?</span>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={signOutState === "pending"}
                    className="rounded-xl border border-line-strong px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:text-ink"
                  >
                    Stay
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signOutState === "pending"}
                    className="inline-flex items-center gap-2 rounded-xl bg-action px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-action-hover disabled:opacity-60"
                  >
                    {signOutState === "pending" ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <LogOut size={14} />
                    )}
                    Sign out
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="start"
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  onClick={() => setConfirming(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line-strong px-3.5 py-2 text-[13px] font-semibold text-ink-2 transition hover:border-brand-line hover:text-brand-text"
                >
                  <LogOut size={14} /> Sign out
                </motion.button>
              )}
            </AnimatePresence>
            {signOutError ? (
              <p role="alert" className="mt-3 text-[12.5px] text-brand-text">
                {signOutError}
              </p>
            ) : null}
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-3.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sunken text-muted">
        <Icon size={15} />
      </span>
      <dt className="w-32 shrink-0 text-[12.5px] font-semibold text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
