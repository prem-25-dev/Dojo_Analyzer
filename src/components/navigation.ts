import {
  Activity,
  BarChart3,
  Building2,
  FileText,
  Languages,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/auth/profile";

// ─── Navigation map ────────────────────────────────────────────────────────────
// The navbar shows groups; each group's pages appear as tabs under the navbar.
// Every page keeps its own URL, so deep links and bookmarks still work.

export type NavTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
  /** Match only this exact path (e.g. /leaderboard must not match /leaderboard/language). */
  exact?: boolean;
};

export type NavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
  tabs: readonly NavTab[];
  /** Shown as a dropdown in the navbar instead of a plain link. */
  menu?: boolean;
};

const EVERYONE = [
  "super_admin",
  "campus_manager",
  "mentor",
  "student",
] as const;
const STAFF = ["super_admin", "campus_manager", "mentor"] as const;
const MANAGERS = ["super_admin", "campus_manager"] as const;
const SUPER_ADMIN = ["super_admin"] as const;

export const navGroups: readonly NavGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: STAFF,
    tabs: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: STAFF,
        exact: true,
      },
    ],
  },
  {
    key: "leaderboards",
    label: "Leaderboards",
    icon: Trophy,
    roles: EVERYONE,
    tabs: [
      {
        href: "/leaderboard",
        label: "Overall",
        icon: BarChart3,
        roles: EVERYONE,
        exact: true,
      },
      {
        href: "/leaderboard/language",
        label: "Language belts",
        icon: Languages,
        roles: STAFF,
      },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    icon: TrendingUp,
    roles: STAFF,
    tabs: [
      {
        href: "/weekly-comparison",
        label: "Weekly comparison",
        icon: Activity,
        roles: STAFF,
      },
      {
        href: "/analytics",
        label: "Monthly & yearly",
        icon: TrendingUp,
        roles: STAFF,
      },
    ],
  },
  {
    key: "students",
    label: "Students",
    icon: Users,
    roles: MANAGERS,
    tabs: [
      { href: "/students", label: "Squads", icon: Users, roles: MANAGERS },
      { href: "/imports", label: "Imports", icon: FileText, roles: MANAGERS },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldCheck,
    roles: SUPER_ADMIN,
    menu: true,
    tabs: [
      {
        href: "/universities",
        label: "Universities",
        icon: Building2,
        roles: SUPER_ADMIN,
      },
      { href: "/users", label: "Users", icon: User, roles: SUPER_ADMIN },
      {
        href: "/audit-logs",
        label: "Audit logs",
        icon: ScrollText,
        roles: SUPER_ADMIN,
      },
    ],
  },
];

export function isTabActive(tab: NavTab, pathname: string) {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

/** Groups and tabs the role may see; groups left with no tabs are dropped. */
export function visibleGroups(role: UserRole | undefined): NavGroup[] {
  if (!role) return [];
  return navGroups
    .filter((group) => group.roles.includes(role))
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => tab.roles.includes(role)),
    }))
    .filter((group) => group.tabs.length > 0);
}

export function activeGroup(groups: readonly NavGroup[], pathname: string) {
  return groups.find((group) =>
    group.tabs.some((tab) => isTabActive(tab, pathname)),
  );
}
