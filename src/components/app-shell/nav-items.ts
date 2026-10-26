import {
  ArrowLeftRightIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: `/${string}`;
  label: string;
  icon: LucideIcon;
}

/** Main sections, in display order. Five items fit the mobile tab bar; add more only to the desktop sidebar. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRightIcon },
  { href: "/budgets", label: "Budgets", icon: PiggyBankIcon },
  { href: "/accounts", label: "Accounts", icon: LandmarkIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];
