/** Unlisted admin sign-in. Set NEXT_PUBLIC_ADMIN_GATE_SLUG in .env.local — never link this from public pages. */
export const ADMIN_GATE_SLUG = process.env.NEXT_PUBLIC_ADMIN_GATE_SLUG ?? "";

export function adminLoginPath() {
  if (!ADMIN_GATE_SLUG) return "/";
  return `/gate/${ADMIN_GATE_SLUG}`;
}
