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
      <StudentNav />
      <ExerciseLibrary />
    </DashboardLayout>
  );
}
