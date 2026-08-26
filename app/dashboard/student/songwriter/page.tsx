import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import SongwriterChat from "@/components/ai/SongwriterChat";

export default function SongwriterPage() {
  return (
    <DashboardLayout
      title="Нейросоздание песен"
      subtitle="Тексты, рифмы и вокальные подсказки от ИИ-продюсера"
      bottomInset
    >
      <div className="flex w-full max-w-[100vw] flex-col overflow-hidden">
        <StudentNav />
        <SongwriterChat />
      </div>
    </DashboardLayout>
  );
}
