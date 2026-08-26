"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { reviewVocalTest } from "@/lib/cat-xp";

export default function VocalTestReviewActions({
  resultId,
}: {
  resultId?: string;
}) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<"idle" | "approved" | "rejected" | "busy">(
    "idle"
  );
  const [error, setError] = useState("");

  if (!isAdmin || !resultId) return null;

  const decide = async (approve: boolean) => {
    if (status === "busy") return;
    setStatus("busy");
    setError("");
    try {
      await reviewVocalTest(resultId, approve);
      setStatus(approve ? "approved" : "rejected");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Не удалось оценить тест");
    }
  };

  if (status === "approved") {
    return (
      <p className="text-xs text-emerald-300">
        Тест засчитан — ученик получил лапки к уровню.
      </p>
    );
  }
  if (status === "rejected") {
    return <p className="text-xs text-studio-muted">Тест не засчитан.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-studio-muted">
        Засчитать профессиональный тест для уровня котика?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={status === "busy"}
          onClick={() => void decide(true)}
        >
          Засчитать
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={status === "busy"}
          onClick={() => void decide(false)}
        >
          Не засчитывать
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
