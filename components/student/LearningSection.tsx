"use client";

import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";

export default function LearningSection() {
  return (
    <div>
      <h3 className="font-display text-2xl font-semibold">
        Библиотека упражнений
      </h3>
      <p className="mb-5 mt-1 text-sm text-studio-muted">
        Материалы открываются в соответствии с тарифом платформы.
      </p>
      <ExerciseLibrary />
    </div>
  );
}
