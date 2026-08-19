import { clearOriginPreference } from "@/lib/supabase-origin";

/**
 * iOS standalone PWA ignores location.reload() and serves the SW cache.
 * Bust the URL and drop the sticky origin so the next boot re-races paths.
 */
export function reloadCabinet() {
  clearOriginPreference();
  const url = new URL(window.location.href);
  url.searchParams.delete("_r");
  url.searchParams.set("_r", String(Date.now()));
  window.location.href = url.toString();
}
