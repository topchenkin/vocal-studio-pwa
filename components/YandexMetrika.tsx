"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { YANDEX_METRIKA_ID } from "@/lib/yandex-metrika";

declare global {
  interface Window {
    ym?: (counterId: number, eventName: string, ...args: unknown[]) => void;
  }
}

function MetrikaHits() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstHit = useRef(true);

  useEffect(() => {
    if (firstHit.current) {
      firstHit.current = false;
      return;
    }
    const query = searchParams.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    window.ym?.(YANDEX_METRIKA_ID, "hit", url);
  }, [pathname, searchParams]);

  return null;
}

/** SPA pageviews after the first HTML hit from the layout snippet. */
export default function YandexMetrika() {
  return (
    <Suspense fallback={null}>
      <MetrikaHits />
    </Suspense>
  );
}
