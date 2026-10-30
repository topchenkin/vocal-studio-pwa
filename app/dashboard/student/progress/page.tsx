import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProgressDetails from "@/components/student/ProgressDetails";

export default function StudentProgressPage() {
  return (
    <DashboardLayout
      title="Мой прогресс"
      subtitle="Рекорды, статистика и история тестов"
      bottomInset
      student
    >
      <ProgressDetails />
    </DashboardLayout>
  );
}
