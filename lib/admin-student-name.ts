/** Admin CRM label. Never use this in student-facing copy. */
export function adminStudentName(
  student: {
    admin_display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    id?: string;
  },
  fallback = "Ученик"
): string {
  const alias = student.admin_display_name?.trim();
  if (alias) return alias;
  const name = student.full_name?.trim();
  if (name) return name;
  const email = student.email?.trim();
  if (email) return email;
  if (student.id) return `Ученик ${student.id.slice(0, 8)}`;
  return fallback;
}
