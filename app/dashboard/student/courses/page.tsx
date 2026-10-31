import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { TEACHER_AVATARS } from "@/lib/vocal-exercise";

export default function StudentCoursesPage() {
  return (
    <DashboardLayout title="Курсы" bottomInset student>
      <div className="flex min-h-[min(28rem,70dvh)] flex-col items-center justify-center px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={TEACHER_AVATARS.satisfied}
          alt=""
          className="h-44 w-44 max-w-[70vw] bg-transparent object-contain sm:h-52 sm:w-52"
        />
        <p className="mt-6 max-w-sm text-base leading-relaxed text-studio-muted">
          Скоро здесь будет новый курс от вашего преподавателя
        </p>
      </div>
    </DashboardLayout>
  );
}
