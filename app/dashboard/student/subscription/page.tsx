import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SubscriptionCabinet from "@/components/student/SubscriptionCabinet";

export default function StudentSubscriptionPage() {
  return (
    <DashboardLayout
      title="Подписка"
      subtitle="Тариф, оплата и способ списания"
      bottomInset
      student
    >
      <div className="mt-5">
        <SubscriptionCabinet />
      </div>
    </DashboardLayout>
  );
}
