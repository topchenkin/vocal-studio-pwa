"use client";

import { motion } from "framer-motion";
import type { RadarAxes } from "@/lib/timbre-features";

type Props = {
  axes: RadarAxes;
  size?: number;
};

const AXES: Array<{ key: keyof RadarAxes; label: string; angleDeg: number }> = [
  { key: "depth", label: "Глубина", angleDeg: -90 },
  { key: "brightness", label: "Яркость", angleDeg: 30 },
  { key: "air", label: "Воздух", angleDeg: 150 },
];

function toPoint(
  angleDeg: number,
  valuePercent: number,
  radius: number,
  center: number
) {
  const angle = (angleDeg * Math.PI) / 180;
  const r = (Math.max(0, Math.min(100, valuePercent)) / 100) * radius;
  return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
}

/** Lightweight custom SVG spider/radar chart — no charting library dependency. */
export default function VoiceRadarChart({ axes, size = 240 }: Props) {
  const center = size / 2;
  const radius = size / 2 - 46;
  const rings = [25, 50, 75, 100];

  const dataPoints = AXES.map((a) => toPoint(a.angleDeg, axes[a.key], radius, center));
  const polygonPoints = dataPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto overflow-visible"
      role="img"
      aria-label="Радар тембра: Глубина, Яркость, Воздух"
    >
      <defs>
        <radialGradient id="voiceRadarFill" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#f472b6" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.12} />
        </radialGradient>
      </defs>

      {rings.map((r) => {
        const pts = AXES.map((a) => toPoint(a.angleDeg, r, radius, center));
        return (
          <polygon
            key={r}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth={1}
          />
        );
      })}

      {AXES.map((a) => {
        const p = toPoint(a.angleDeg, 100, radius, center);
        return (
          <line
            key={a.key}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="rgba(148,163,184,0.28)"
            strokeWidth={1}
          />
        );
      })}

      <motion.polygon
        points={polygonPoints}
        fill="url(#voiceRadarFill)"
        stroke="#f472b6"
        strokeWidth={2}
        strokeLinejoin="round"
        initial={{ opacity: 0, pathLength: 0 }}
        animate={{ opacity: 1, pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />

      {AXES.map((a, i) => {
        const dot = dataPoints[i]!;
        const labelPoint = toPoint(a.angleDeg, 128, radius, center);
        return (
          <g key={a.key}>
            <motion.circle
              cx={dot.x}
              cy={dot.y}
              r={4}
              fill="#f472b6"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y - 4}
              textAnchor="middle"
              className="fill-studio-text text-[11px] font-semibold"
            >
              {a.label}
            </text>
            <text
              x={labelPoint.x}
              y={labelPoint.y + 11}
              textAnchor="middle"
              className="fill-studio-accent-light text-[11px] font-bold tabular-nums"
            >
              {Math.round(axes[a.key])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
