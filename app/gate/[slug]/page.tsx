import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import { ADMIN_GATE_SLUG } from "@/lib/admin-gate";

export const dynamicParams = false;

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false, nocache: true },
};

export function generateStaticParams() {
  if (!ADMIN_GATE_SLUG) return [];
  return [{ slug: ADMIN_GATE_SLUG }];
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
