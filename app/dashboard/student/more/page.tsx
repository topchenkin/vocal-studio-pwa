import DashboardLayout from "@/components/dashboard/DashboardLayout";
import MoreMenu from "@/components/student/MoreMenu";

export default function StudentMorePage() {
  return (
    <DashboardLayout
      title="Ещё"
      subtitle="Подписка, лаборатория и настройки"
      bottomInset
      student
    >
      <MoreMenu />
    </DashboardLayout>
  );
}
