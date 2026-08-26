import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import PocketStudio from "@/components/student/PocketStudio";

export default function PocketStudioPage() {
  return (
    <DashboardLayout
      title="Карманная студия"
      subtitle="Пойте под минус и сведите голос со студийными эффектами"
      bottomInset
    >
      <div className="flex w-full max-w-[100vw] flex-col overflow-hidden">
        <StudentNav />
        <PocketStudio />
      </div>
    </DashboardLayout>
  );
}
