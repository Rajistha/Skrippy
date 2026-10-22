"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Menu } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import { AccessGate } from "./AccessGate";
import { AccessBanner, AccessPanel } from "./Access";

type NavItem = { href: string; label: string; icon: IconName };

const USER_NAV: NavItem[] = [
  { href: "/dashboard", label: t.nav.dashboard, icon: "dashboard" },
  { href: "/skripsi", label: t.nav.theses, icon: "thesis" },
  { href: "/riwayat", label: t.nav.history, icon: "history" },
];

const USER_ACCOUNT_NAV: NavItem[] = [{ href: "/profil", label: t.nav.access, icon: "user" }];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: t.nav.adminSummary, icon: "admin" },
  { href: "/admin/kode", label: t.nav.adminCodes, icon: "code" },
  { href: "/admin/pengguna", label: t.nav.adminUsers, icon: "users" },
  { href: "/admin/pedoman", label: t.nav.adminGuidelines, icon: "book" },
  { href: "/admin/kamus", label: t.nav.adminDictionary, icon: "spelling" },
  { href: "/admin/sistem", label: t.nav.adminSystem, icon: "server" },
  { href: "/admin/pengaturan", label: t.nav.adminSettings, icon: "settings" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" || href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 px-3 pb-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-400">
      {children}
    </p>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors",
        active
          ? "bg-primary-50 text-primary-700 before:absolute before:-left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-1 before:rounded-r-full before:bg-primary-500"
          : "text-ink-500 hover:bg-primary-50/60 hover:text-ink-900",
      )}
    >
      <Icon name={item.icon} className={active ? "text-primary-500" : undefined} />
      {item.label}
    </Link>
  );
}

function Avatar({ url, label }: { url: string | null; label: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="size-10 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid size-10 place-items-center rounded-full bg-primary-100 text-[15px] font-semibold text-primary-700">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

type ShellProps = {
  children: ReactNode;
  title?: string;
  /** Satu kalimat penjelasan di bawah judul. */
  description?: string;
  /** Tombol aksi utama halaman, rata kanan di sebelah judul. */
  actions?: ReactNode;
  /** Tautan kembali (halaman detail). */
  back?: { href: string; label: string };
};

export function AppShell({ children, title, description, actions, back }: ShellProps) {
  const { me, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = me.profile.role === "superadmin";
  const inAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const displayName = me.profile.full_name ?? me.profile.email;

  // Dua area terpisah. Superadmin boleh berpindah ke dua-duanya; pengguna biasa tidak punya panel admin.
  useEffect(() => {
    if (!isAdmin && inAdminArea) router.replace("/dashboard");
  }, [isAdmin, inAdminArea, router]);
  if (!isAdmin && inAdminArea) return null;

  const switchItem: NavItem | null = !isAdmin
    ? null
    : inAdminArea
      ? { href: "/dashboard", label: t.nav.openApp, icon: "home" }
      : { href: "/admin", label: t.nav.adminArea, icon: "admin" };
  const mainNav = inAdminArea ? ADMIN_NAV : USER_NAV;
  // Tanpa akses sama sekali (trial mati dan belum menukar kode): semua halaman terkunci kecuali Profil.
  const locked = !inAdminArea && me.access.state === "none" && pathname !== "/profil";
  const home = inAdminArea ? "/admin" : "/dashboard";

  const accountMenu = (
    <Menu
      label={t.nav.userMenu}
      placement="up"
      className="w-full"
      triggerClassName="w-full rounded-lg p-2 pr-3 hover:bg-primary-50"
      header={
        <div className="leading-5">
          <p className="truncate text-[15px] font-semibold text-ink-900">{displayName}</p>
          <p className="truncate text-[13px] text-ink-500">{me.profile.email}</p>
        </div>
      }
      items={[
        ...(inAdminArea ? [] : [{ label: t.nav.access, icon: "user" as const, href: "/profil" }]),
        ...(switchItem
          ? [{ label: switchItem.label, icon: switchItem.icon, href: switchItem.href }]
          : []),
        {
          label: t.nav.signOut,
          icon: "signOut" as const,
          tone: "danger" as const,
          onSelect: () => void signOut(),
        },
      ]}
    >
      <Avatar url={me.profile.avatar_url} label={displayName} />
      <span className="min-w-0 flex-1 text-left leading-5">
        <span className="block truncate text-[15px] font-semibold text-ink-900">{displayName}</span>
        <span className="block truncate text-[13px] text-ink-500">
          {isAdmin ? t.nav.adminRole : me.profile.email}
        </span>
      </span>
    </Menu>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr] lg:gap-4 lg:p-4">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] flex-col rounded-xl bg-surface p-4 shadow-sm lg:flex">
        <Link href={home} aria-label={t.nav.dashboard} className="px-3 py-2">
          <Logo />
        </Link>
        <nav aria-label={t.nav.mainMenu} className="min-h-0 flex-1 overflow-y-auto">
          <GroupLabel>{inAdminArea ? t.nav.groupAdmin : t.nav.groupMenu}</GroupLabel>
          <div className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
          {!inAdminArea && (
            <>
              <GroupLabel>{t.nav.groupAccount}</GroupLabel>
              <div className="flex flex-col gap-1">
                {USER_ACCOUNT_NAV.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </>
          )}
          {switchItem && (
            <>
              <GroupLabel>{inAdminArea ? t.nav.groupApp : t.nav.groupAdmin}</GroupLabel>
              <NavLink item={switchItem} pathname={pathname} />
            </>
          )}
        </nav>

        {!inAdminArea && <AccessPanel access={me.access} />}
        <div className="mt-3 border-t border-ink-100 pt-3">{accountMenu}</div>
      </aside>

      {/* Kolom utama */}
      <div className="flex min-w-0 flex-col pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-ink-100 bg-surface px-4 shadow-xs sm:px-6 lg:hidden">
          <Link href={home} aria-label={t.app.name} className="flex items-center">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            {inAdminArea && (
              <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">
                {t.nav.adminRole}
              </span>
            )}
            <Menu
              label={t.nav.userMenu}
              header={
                <div className="leading-5">
                  <p className="truncate text-[15px] font-semibold text-ink-900">{displayName}</p>
                  <p className="truncate text-[13px] text-ink-500">{me.profile.email}</p>
                </div>
              }
              items={[
                ...(inAdminArea
                  ? []
                  : [{ label: t.nav.access, icon: "user" as const, href: "/profil" }]),
                ...(switchItem
                  ? [{ label: switchItem.label, icon: switchItem.icon, href: switchItem.href }]
                  : []),
                {
                  label: t.nav.signOut,
                  icon: "signOut" as const,
                  tone: "danger" as const,
                  onSelect: () => void signOut(),
                },
              ]}
            >
              <Avatar url={me.profile.avatar_url} label={displayName} />
            </Menu>
          </div>
        </header>

        <main
          id="konten"
          className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:px-2 lg:pb-6 lg:pt-8"
        >
          {!inAdminArea && !locked && <AccessBanner access={me.access} />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              {back && (
                <Link
                  href={back.href}
                  className="mb-2 inline-flex min-h-9 items-center gap-1.5 text-[14px] font-semibold text-primary-600 hover:underline"
                >
                  <Icon name="back" /> {back.label}
                </Link>
              )}
              <h1
                className={cn(
                  "font-display font-semibold text-ink-900",
                  // Judul panjang (mis. judul skripsi) dikecilkan dan dibatasi dua baris.
                  (title?.length ?? 0) > 40
                    ? "line-clamp-2 text-[22px] leading-8 lg:text-[26px] lg:leading-9"
                    : "text-[24px] leading-8 sm:text-[28px] sm:leading-9 lg:text-[32px] lg:leading-10",
                )}
                title={title}
              >
                {title ?? t.app.name}
              </h1>
              {description && (
                <p className="mt-1 text-[14px] leading-6 text-ink-500 sm:text-[15px]">
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2.5 sm:gap-3">{actions}</div>}
          </div>
          {locked ? <AccessGate /> : children}
        </main>
      </div>

      {/* Navigasi bawah (ponsel) */}
      <nav
        aria-label={t.nav.mainMenu}
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 border-t border-ink-100 bg-surface/95 shadow-lg backdrop-blur-md lg:hidden",
          inAdminArea ? "grid grid-cols-6" : "grid grid-cols-4",
        )}
      >
        {(inAdminArea ? ADMIN_NAV : [...USER_NAV, ...USER_ACCOUNT_NAV]).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-center transition-colors",
                inAdminArea ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-[12px]",
                active
                  ? "font-bold text-primary-600"
                  : "font-medium text-ink-500 hover:text-ink-900",
              )}
            >
              <Icon
                name={item.icon}
                className={cn(
                  inAdminArea ? "text-[16px] sm:text-[18px]" : "text-[18px]",
                  active ? "text-primary-600" : undefined,
                )}
              />
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
