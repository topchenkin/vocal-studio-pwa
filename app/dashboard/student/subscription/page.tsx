import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import SubscriptionCabinet from "@/components/student/SubscriptionCabinet";

export default function StudentSubscriptionPage() {
  return (
    <DashboardLayout
      title="Подписка"
      subtitle="Тариф, оплата и способ списания"
      bottomInset
    >
      <StudentNav />
      <SubscriptionCabinet />
    </DashboardLayout>
  );
}
