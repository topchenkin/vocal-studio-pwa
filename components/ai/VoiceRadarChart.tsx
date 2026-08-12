"use client";

import type { TimbreVector } from "@/lib/celebritiesDB";

type Props = {
  user: TimbreVector;
  match?: (TimbreVector & { name: string }) | null;
};

const AXES: Array<{
  key: keyof TimbreVector;
  label: string;
  low: string;
  high: string;
  angleDeg: number;
}> = [
  { key: "timbreWeight", label: "Тембр", low: "тёмный", high: "светлый", angleDeg: -90 },
  { key: "airiness", label: "Воздух", low: "плотный", high: "с придыханием", angleDeg: 30 },
  { key: "raspiness", label: "Расщепление", low: "чистый", high: "хриплый", angleDeg: 150 },
];

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2 + 8;
const RADIUS = 86;

function polar(angleDeg: number, t: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + Math.cos(rad) * RADIUS * t,
    y: CY + Math.sin(rad) * RADIUS * t,
  };
}

function polygonPoints(vector: TimbreVector): string {
  return AXES.map((axis) => {
    const t = Math.max(0, Math.min(100, vector[axis.key])) / 100;
    const { x, y } = polar(axis.angleDeg, t);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function VoiceRadarChart({ user, match }: Props) {
  const rings = [0.33, 0.66, 1];

  return (
    <div className="rounded-2xl bg-studio-bg/80 px-3 py-4 ring-1 ring-studio-border">
      <p className="mb-1 text-center text-sm font-semibold text-studio-text">
        3D-профиль тембра
      </p>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE + 24}`}
        className="mx-auto h-auto w-full max-w-[320px]"
        role="img"
        aria-label="Радар тембра: вес, воздух, расщепление"
      >
        {rings.map((t) => (
          <polygon
            key={t}
            points={AXES.map((axis) => {
              const { x, y } = polar(axis.angleDeg, t);
              return `${x},${y}`;
            }).join(" ")}
            fill="none"
            className="stroke-studio-border"
            strokeWidth={1}
          />
        ))}
        {AXES.map((axis) => {
          const tip = polar(axis.angleDeg, 1);
          const label = polar(axis.angleDeg, 1.38);
          return (
            <g key={axis.key}>
              <line
                x1={CX}
                y1={CY}
                x2={tip.x}
                y2={tip.y}
                className="stroke-studio-border"
                strokeWidth={1}
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                className="fill-studio-text"
                fontSize={12}
                fontWeight={600}
              >
                {axis.label}
              </text>
              <text
                x={label.x}
                y={label.y + 14}
                textAnchor="middle"
                className="fill-studio-muted"
                fontSize={9}
              >
                {axis.low} ↔ {axis.high}
              </text>
            </g>
          );
        })}
        {match && (
          <polygon
            points={polygonPoints(match)}
            fill="rgb(56 189 248 / 0.12)"
            stroke="rgb(125 211 252)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        <polygon
          points={polygonPoints(user)}
          fill="rgb(244 114 182 / 0.28)"
          stroke="rgb(249 168 212)"
          strokeWidth={2}
        />
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-studio-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-pink-300" />
          Вы
        </span>
        {match && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-300" />
            {match.name}
          </span>
        )}
      </div>
    </div>
  );
}
