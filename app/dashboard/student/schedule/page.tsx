import { Suspense } from "react";
import StudentScheduleClient from "./StudentScheduleClient";

export default function StudentSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-studio-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      }
    >
      <StudentScheduleClient />
    </Suspense>
  );
}
