"use client";

import type { ReactNode, MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const CABINET_TAB_EVENT = "uvs-cabinet-tab";
const STORAGE_KEY = "uvs-cabinet-tab";

export function requestCabinetTab(tabId: string) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab: tabId, at: Date.now() })
    );
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(CABINET_TAB_EVENT, { detail: tabId }));
}

export function consumeRequestedCabinetTab(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as { tab?: unknown; at?: unknown };
    if (typeof parsed.at === "number" && Date.now() - parsed.at > 8_000) {
      return null;
    }
    return typeof parsed.tab === "string" ? parsed.tab : null;
  } catch {
    return null;
  }
}

export default function CabinetTabLink({
  href,
  tabId,
  className,
  children,
}: {
  href: string;
  tabId: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    requestCabinetTab(tabId);
    const target = new URL(href, window.location.origin);
    const alreadyThere =
      pathname === target.pathname && searchParams.get("tab") === tabId;
    if (alreadyThere) {
      window.dispatchEvent(new Event("uvs-audio-saved"));
      return;
    }
    router.push(href);
  };

  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
