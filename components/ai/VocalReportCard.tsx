import { useEffect, useRef } from "react";
import { Cat } from "lucide-react";
import { TEST_IN_TUNE_CENTS, mentorFeedback } from "@/lib/vocal-metrics";
import type { VocalReportPayload } from "@/lib/vocal-report-payload";
import type { CatLevel } from "@/types";

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold text-studio-accent-light">{value}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-studio-bg">
        <div
          className="h-full rounded-full bg-gradient-to-r from-studio-accent to-violet-400"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function VocalReportCard({
  payload,
  catLevel,
  compact = false,
}: {
  payload: VocalReportPayload;
  catLevel?: CatLevel | null;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mentor = mentorFeedback(payload.overallScore, catLevel);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);

    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    for (const yCents of [-50, -25, 0, 25, 50]) {
      const y = height / 2 - (yCents / 60) * (height / 2);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(width, y);
      g.stroke();
    }

    const yTop = height / 2 - (TEST_IN_TUNE_CENTS / 60) * (height / 2);
    const yBot = height / 2 + (TEST_IN_TUNE_CENTS / 60) * (height / 2);
    g.fillStyle = "rgba(52, 211, 153, 0.12)";
    g.fillRect(0, yTop, width, yBot - yTop);

    if (payload.cents.length === 0) return;
    g.strokeStyle = "#c084fc";
    g.lineWidth = 2;
    g.beginPath();
    payload.cents.forEach((centsVal, index) => {
      const x = (index / Math.max(1, payload.cents.length - 1)) * width;
      const clamped = Math.max(-60, Math.min(60, centsVal));
      const y = height / 2 - (clamped / 60) * (height / 2);
      if (index === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  }, [payload.cents]);

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      <div className="rounded-2xl bg-gradient-to-br from-studio-accent/20 via-studio-surface to-amber-500/10 p-4 text-center ring-1 ring-studio-border">
        <p className="text-[10px] uppercase tracking-wide text-studio-muted">
          Отчёт вокалиста
        </p>
        <p className={`mt-1 font-display font-semibold ${compact ? "text-3xl" : "text-5xl"}`}>
          {payload.overallScore}
          <span className="text-xl text-studio-muted"> / 100</span>
        </p>
        <p className="mt-1 text-xs text-studio-muted">
          {payload.mode === "scale"
            ? "Гамма C4–E4–G4"
            : `Нота ${payload.targetLabel}`}{" "}
          · {payload.durationSec}с
        </p>
      </div>

      <MetricBar label="Точность нот" value={payload.pitchAccuracy} />
      <MetricBar label="Стабильность тона" value={payload.toneStability} />
      <MetricBar label="Удержание дыхания" value={payload.breathControl} />

      <div className="rounded-2xl bg-studio-bg/70 p-3 ring-1 ring-studio-border">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <Cat className="h-4 w-4 text-amber-300" />
          Отзыв Котика-наставника
        </div>
        <p className="text-sm leading-relaxed text-studio-muted">{mentor}</p>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-studio-muted">
          График девиации центов
        </p>
        <div className="overflow-hidden rounded-xl bg-studio-bg ring-1 ring-studio-border">
          <canvas
            ref={canvasRef}
            width={compact ? 320 : 560}
            height={compact ? 96 : 160}
            className={compact ? "h-24 w-full" : "h-36 w-full"}
          />
        </div>
        {!compact && (
          <p className="mt-1 text-[11px] text-studio-muted">
            Зелёная полоса — зона теста ±{TEST_IN_TUNE_CENTS}¢
          </p>
        )}
      </div>
    </div>
  );
}
