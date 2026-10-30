import { Suspense } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentChatSection from "@/components/student/StudentChatSection";

export default function StudentChatPage() {
  return (
    <DashboardLayout
      title="Чат"
      subtitle="Переписка с преподавателем"
      compact
      bottomInset
      student
    >
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <StudentChatSection />
        </div>
      </Suspense>
    </DashboardLayout>
  );
}
