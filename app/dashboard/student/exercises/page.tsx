import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StudentNav from "@/components/student/StudentNav";
import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";

export default function StudentExercisesPage() {
  return (
    <DashboardLayout
      title="База упражнений"
      subtitle="Распевки и видео-уроки для ежедневной практики"
      bottomInset
    >
      <div className="flex w-full max-w-[100vw] flex-col box-border overflow-x-hidden px-2 sm:px-4">
        <StudentNav />
        <ExerciseLibrary />
      </div>
    </DashboardLayout>
  );
}
