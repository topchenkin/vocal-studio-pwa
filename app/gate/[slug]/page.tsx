import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { ADMIN_GATE_SLUG } from "@/lib/admin-gate";

export const dynamicParams = false;

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false, nocache: true },
};

/** Static export forbids an empty `generateStaticParams()` (CI has no gate slug). */
const EXPORT_PLACEHOLDER = "__export__";

export function generateStaticParams() {
  return [{ slug: ADMIN_GATE_SLUG || EXPORT_PLACEHOLDER }];
}

export default async function AdminGatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!ADMIN_GATE_SLUG || slug !== ADMIN_GATE_SLUG) notFound();
  return <AdminLoginForm />;
}
