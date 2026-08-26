import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import AiMusicComposer from "@/components/ai/AiMusicComposer";

export default function AiMusicPage() {
  return (
    <DashboardLayout
      title="ИИ-композитор"
      subtitle="Авторские минусовки по текстовому описанию"
      bottomInset
    >
      <div className="flex w-full max-w-[100vw] flex-col overflow-hidden">
        <StudentNav />
        <AiMusicComposer />
      </div>
    </DashboardLayout>
  );
}
