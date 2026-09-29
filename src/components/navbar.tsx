"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, FileUp, LogOut, Menu, User, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  avatarUrlOf,
  getCurrentUserProfile,
  type UserProfile,
} from "@/lib/auth/profile";
import { Avatar } from "@/components/ui/avatar";
import { CsvUploadDialog } from "@/components/csv-upload-dialog";
import { supabase } from "@/lib/supabase/client";
import { GlassSurface } from "@/components/reactbits/glass-surface";
import { OfferHover } from "@/components/ui/offer-button";
import { useDashboardHeadline } from "@/components/dashboard/use-dashboard-headline";
import { ShinyButton } from "@/components/ui/shiny-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  activeGroup,
  isTabActive,
  visibleGroups,
  type NavGroup,
} from "@/components/navigation";
import { SectionTabs } from "@/components/section-tabs";

function roleLabel(role: UserProfile["role"]) {
  if (role === "super_admin") return "Super Admin";
  if (role === "campus_manager") return "Campus Manager";
  if (role === "mentor") return "Mentor";
  return "Student";
}

// ─── Avatar ────────────────────────────────────────────────────────────────────
function AvatarCircle({
  name,
  src,
  size = 32,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
}) {
  return <Avatar src={src} name={name} seed={name ?? "me"} size={size} />;
}

// ─── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileButton({
  profile,
  email,
  avatarUrl,
  onClose,
}: {
  profile: UserProfile;
  email: string | null;
  avatarUrl: string | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signOutState, setSignOutState] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [signOutError, setSignOutError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  async function handleSignOut() {
    setSignOutState("pending");
    setSignOutError("");
    try {
      // Clear in-memory session first, then hit the server route to clear cookies.
      await supabase.auth.signOut({ scope: "local" });
      const res = await fetch("/auth/signout", {
        method: "POST",
        redirect: "manual",
      });
      // fetch with redirect:manual won't follow the 303; that's fine — we redirect ourselves.
      if (!res.ok && res.status !== 0 && res.type !== "opaqueredirect") {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Sign out failed.");
      }
      if (onClose) onClose();
      router.replace("/login");
    } catch (err) {
      setSignOutState("error");
      setSignOutError(err instanceof Error ? err.message : "Sign out failed.");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className={`flex items-center gap-1.5 rounded-xl px-1.5 py-1 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
          open ? "bg-ink/8" : "hover:bg-ink/5"
        }`}
      >
        <AvatarCircle name={profile.full_name} src={avatarUrl} size={30} />
        <ChevronDown
          size={13}
          className={`hidden sm:block text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-60 origin-top-right rounded-2xl py-1.5"
          style={{
            background: "var(--glass-strong)",
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            border: "1px solid var(--line)",
            boxShadow: "var(--pop-shadow)",
          }}
          role="menu"
          aria-label="Account options"
        >
          {/* User info */}
          <div className="px-4 py-3 border-b border-line">
            <div className="flex items-center gap-3">
              <AvatarCircle name={profile.full_name} src={avatarUrl} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {profile.full_name ?? "—"}
                </p>
                {email && (
                  <p className="truncate text-xs text-muted">{email}</p>
                )}
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-text">
                  {roleLabel(profile.role)}
                </p>
              </div>
            </div>
          </div>

          {/* Account Profile link */}
          <div className="px-1.5 py-1.5 border-b border-line">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              <User size={14} className="text-faint" />
              Account Profile
            </Link>
          </div>

          {/* Sign out */}
          <div className="px-1.5 py-1.5">
            {signOutError && (
              <p className="mb-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {signOutError}
              </p>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signOutState === "pending"}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-red-50 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={14} className="text-faint" />
              {signOutState === "pending" ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Brand ─────────────────────────────────────────────────────────────────────
function Brand({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex flex-col items-start gap-1.5">
        <Image
          src="/imgs/kalvium_extended_logo.png"
          alt="Kalvium"
          width={2560}
          height={543}
          className="h-[18px] w-auto"
        />
        <span className="font-display text-[14px] font-bold tracking-[-0.02em] text-ink">
          Dojo Belt Analyzer
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <Image
        src="/imgs/kalvium_extended_logo.png"
        alt="Kalvium"
        width={2560}
        height={543}
        preload
        className="h-[18px] w-auto"
      />
      <span aria-hidden="true" className="hidden h-4 w-px bg-ink/12 sm:block" />
      <span className="hidden whitespace-nowrap font-display text-[15px] font-bold tracking-[-0.025em] text-ink sm:block">
        Dojo Belt Analyzer
      </span>
    </span>
  );
}

// ─── Desktop nav with a sliding glass lens ─────────────────────────────────────
const navItemClass =
  "relative z-10 flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-3.5 font-display text-[13.5px] font-semibold tracking-[-0.01em] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-action/40";

function DesktopNav({
  groups,
  pathname,
  dashboardHint,
}: {
  groups: readonly NavGroup[];
  pathname: string;
  /** Two live numbers shown in drawers when hovering the Dashboard link. */
  dashboardHint: { top: string; bottom: string } | null;
}) {
  const navRef = useRef<HTMLElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const placedRef = useRef(false);
  const current = activeGroup(groups, pathname);

  // Lens rests on the active group and glides to whichever item is hovered.
  const moveLens = useCallback((target: HTMLElement | null) => {
    const lens = lensRef.current;
    if (!lens) return;
    if (!target) {
      lens.style.opacity = "0";
      return;
    }
    if (!placedRef.current) {
      lens.style.transition = "none";
      placedRef.current = true;
      requestAnimationFrame(() => {
        lens.style.transition = "";
      });
    }
    // Measure against the nav itself: the Admin button sits inside its own
    // positioned wrapper, so offsetLeft would be relative to that instead.
    const navLeft = navRef.current?.getBoundingClientRect().left ?? 0;
    const rect = target.getBoundingClientRect();
    lens.style.opacity = "1";
    lens.style.width = `${rect.width}px`;
    lens.style.transform = `translateX(${rect.left - navLeft}px)`;
  }, []);

  const moveToActive = useCallback(() => {
    moveLens(
      navRef.current?.querySelector<HTMLElement>('[data-active="true"]') ??
        null,
    );
  }, [moveLens]);

  useEffect(() => {
    moveToActive();
    const nav = navRef.current;
    if (!nav) return;
    // Web fonts and viewport changes shift item widths; keep the lens aligned.
    const observer = new ResizeObserver(moveToActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname, groups, moveToActive]);

  return (
    <nav
      ref={navRef}
      className="relative hidden min-w-0 flex-1 items-center gap-0.5 lg:flex"
      aria-label="Main navigation"
      onPointerLeave={moveToActive}
    >
      <span
        ref={lensRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-1/2 h-9 -translate-y-1/2 rounded-xl opacity-0 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] motion-reduce:transition-none"
        style={{
          background: "color-mix(in srgb, var(--ink) 5.5%, transparent)",
          boxShadow: "inset 0 0 0 0.5px var(--line)",
        }}
      />
      {groups.map((group) => {
        const active = group.key === current?.key;
        const hoverProps = {
          onPointerEnter: (event: ReactPointerEvent<HTMLElement>) =>
            moveLens(event.currentTarget),
          onFocus: (event: FocusEvent<HTMLElement>) =>
            moveLens(event.currentTarget),
          onBlur: moveToActive,
        };
        const className = `${navItemClass} ${
          active ? "text-ink" : "text-muted hover:text-ink"
        }`;

        if (group.menu) {
          return (
            <GroupMenu
              key={group.key}
              group={group}
              pathname={pathname}
              active={active}
              className={className}
              hoverProps={hoverProps}
            />
          );
        }
        const link = (
          <Link
            key={group.key}
            href={group.tabs[0].href}
            data-active={active}
            aria-current={active ? "page" : undefined}
            aria-description={
              group.key === "dashboard" && dashboardHint
                ? `${dashboardHint.top}, ${dashboardHint.bottom}`
                : undefined
            }
            className={`${className} ${group.key === "dashboard" ? "offer-trigger" : ""}`}
            {...hoverProps}
          >
            {group.label}
          </Link>
        );
        return group.key === "dashboard" && dashboardHint ? (
          <OfferHover
            key={group.key}
            topDrawerText={dashboardHint.top}
            bottomDrawerText={dashboardHint.bottom}
          >
            {link}
          </OfferHover>
        ) : (
          link
        );
      })}
    </nav>
  );
}

// ─── Dropdown group (Admin) ────────────────────────────────────────────────────
function GroupMenu({
  group,
  pathname,
  active,
  className,
  hoverProps,
}: {
  group: NavGroup;
  pathname: string;
  active: boolean;
  className: string;
  hoverProps: {
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
}) {
  // Open state is tied to the path it was opened on, so navigating closes it.
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const open = openAtPath === pathname;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenAtPath(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenAtPath(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative z-10">
      <button
        type="button"
        data-active={active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenAtPath(open ? null : pathname)}
        className={className}
        {...hoverProps}
      >
        {group.label}
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={group.label}
          className="absolute left-0 top-full mt-3 w-56 rounded-2xl p-1.5"
          style={{
            background: "var(--glass-strong)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            border: "1px solid var(--line)",
            boxShadow: "inset 0 1px 0 var(--glass-rim), var(--pop-shadow)",
          }}
        >
          {group.tabs.map((tab) => {
            const tabActive = isTabActive(tab, pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="menuitem"
                aria-current={tabActive ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-display text-[13.5px] font-semibold tracking-[-0.01em] outline-none transition-colors focus-visible:bg-ink/5 ${
                  tabActive
                    ? "bg-ink/[0.05] text-ink"
                    : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <Icon
                  size={15}
                  className={tabActive ? "text-brand-text" : "text-faint"}
                />
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ───────────────────────────────────────────────────────────────
export function Navbar() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getCurrentUserProfile().then((result) => {
      if (!mounted) return;
      if (result.status === "authenticated") {
        setProfile(result.profile);
        setEmail(result.user.email ?? null);
        setAvatarUrl(avatarUrlOf(result.user));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return <NavbarView profile={profile} email={email} avatarUrl={avatarUrl} />;
}

export function NavbarView({
  profile,
  email,
  avatarUrl = null,
}: {
  profile: UserProfile | null;
  email: string | null;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Drawer is open when mobileOpenAtPath is recorded AND we're still on that path.
  // Navigating away changes pathname, so mobileOpen becomes false automatically — no effect needed.
  const [mobileOpenAtPath, setMobileOpenAtPath] = useState<string | null>(null);
  const mobileOpen = mobileOpenAtPath !== null && pathname === mobileOpenAtPath;
  const [mobileSignOutState, setMobileSignOutState] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const [mobileSignOutError, setMobileSignOutError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSession, setUploadSession] = useState(0);

  const isCampusManager = profile?.role === "campus_manager";
  const isSuperAdmin = profile?.role === "super_admin";
  const canUploadCsv = isCampusManager || isSuperAdmin;
  const headline = useDashboardHeadline(
    Boolean(profile) && profile?.role !== "student",
  );
  const dashboardHint = headline
    ? {
        top: `${headline.beltsGained > 0 ? "+" : ""}${headline.beltsGained} belts · Week ${headline.week}`,
        bottom: `${headline.tested}/${headline.students} tested`,
      }
    : null;
  const groups = visibleGroups(profile?.role);
  const currentGroup = activeGroup(groups, pathname);

  function handleUploadClick() {
    setUploadSession((current) => current + 1);
    setUploadOpen(true);
  }

  async function handleMobileSignOut() {
    setMobileSignOutState("pending");
    setMobileSignOutError("");
    try {
      await supabase.auth.signOut({ scope: "local" });
      await fetch("/auth/signout", { method: "POST", redirect: "manual" });
      router.replace("/login");
    } catch (err) {
      setMobileSignOutState("error");
      setMobileSignOutError(
        err instanceof Error ? err.message : "Sign out failed.",
      );
    }
  }

  return (
    <>
      {/* Ambient red glow — fixed behind page content */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div
          className="absolute -top-32 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(198,40,40,0.055) 0%, transparent 68%)",
            filter: "blur(64px)",
          }}
        />
      </div>

      {/* ── Floating liquid-glass navbar ── */}
      <div className="sticky top-0 z-50 px-3 pt-3 sm:px-4 lg:px-6">
        <header className="relative mx-auto h-16 max-w-[1440px]">
          <GlassSurface className="absolute inset-0" radius={20} />

          <div className="relative z-10 flex h-full items-center justify-between gap-4 pl-4 pr-2.5 sm:pl-5">
            {/* Brand */}
            <Link
              href="/"
              aria-label="Dojo Belt Analyzer home"
              className="flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-action/40"
            >
              <Brand />
            </Link>

            <DesktopNav
              groups={groups}
              pathname={pathname}
              dashboardHint={dashboardHint}
            />

            {/* Right controls */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Upload CSV — main import action */}
              {canUploadCsv && (
                <ShinyButton
                  onClick={handleUploadClick}
                  className="group hidden h-10 px-4 font-display text-[13.5px] font-semibold tracking-[-0.01em] sm:inline-flex sm:items-center"
                >
                  <FileUp
                    size={15}
                    strokeWidth={2.2}
                    className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-0.5"
                  />
                  Upload CSV
                </ShinyButton>
              )}

              <ThemeToggle />

              {/* Profile dropdown button (desktop) */}
              {profile ? (
                <ProfileButton profile={profile} email={email} avatarUrl={avatarUrl} />
              ) : (
                /* Fallback placeholder while loading — keeps layout stable */
                <div
                  className="h-8 w-8 rounded-full bg-ink/5"
                  aria-hidden="true"
                />
              )}

              {/* Mobile hamburger */}
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-ink/5 lg:hidden"
                onClick={() => setMobileOpenAtPath(pathname)}
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
            </div>
          </div>
        </header>
      </div>

      {currentGroup && <SectionTabs group={currentGroup} pathname={pathname} />}

      {/* ── Mobile menu ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/40"
            style={{
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
            }}
            onClick={() => setMobileOpenAtPath(null)}
          />
          <div
            className="absolute right-0 top-0 flex h-full w-72 flex-col"
            style={{
              background: "var(--glass-strong)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderLeft: "1px solid var(--line)",
              boxShadow: "var(--pop-shadow)",
            }}
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Brand compact />
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-ink/5"
                onClick={() => setMobileOpenAtPath(null)}
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile nav links */}
            <nav
              className="flex-1 overflow-y-auto p-3 space-y-0.5"
              aria-label="Mobile navigation"
            >
              {groups.map((group) => (
                <div key={group.key} className="pb-2">
                  {group.tabs.length > 1 && (
                    <p className="px-3.5 pb-1 pt-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                      {group.label}
                    </p>
                  )}
                  {group.tabs.map((tab) => {
                    const active = isTabActive(tab, pathname);
                    const Icon = tab.icon;
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-semibold transition-all duration-150 ${
                          active
                            ? "bg-ink/[0.05] text-ink"
                            : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
                        }`}
                      >
                        <Icon
                          size={15}
                          className={active ? "text-brand-text" : "text-faint"}
                        />
                        <span>{tab.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Mobile footer */}
            <div className="border-t border-line px-4 py-4 space-y-2">
              {canUploadCsv && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpenAtPath(null);
                    handleUploadClick();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <FileUp size={14} /> Upload CSV
                </button>
              )}

              {profile && (
                <>
                  {/* User info */}
                  <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <AvatarCircle name={profile.full_name} src={avatarUrl} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        {profile.full_name ?? "—"}
                      </p>
                      {email && (
                        <p className="truncate text-[10px] text-muted">
                          {email}
                        </p>
                      )}
                      <p className="text-[10px] font-semibold text-brand-text">
                        {roleLabel(profile.role)}
                      </p>
                    </div>
                  </div>

                  {/* Account profile link */}
                  <Link
                    href="/profile"
                    onClick={() => setMobileOpenAtPath(null)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-ink-2 transition hover:border-action hover:text-brand-text"
                  >
                    <User size={14} className="text-faint" />
                    Account Profile
                  </Link>

                  {/* Sign out */}
                  {mobileSignOutError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {mobileSignOutError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleMobileSignOut}
                    disabled={mobileSignOutState === "pending"}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-ink-2 transition hover:border-action hover:bg-red-50 hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LogOut size={14} className="text-faint" />
                    {mobileSignOutState === "pending"
                      ? "Signing out…"
                      : "Log out"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {canUploadCsv && (
        <CsvUploadDialog
          key={uploadSession}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          requireUniversity={isSuperAdmin}
        />
      )}
    </>
  );
}
