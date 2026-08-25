import { teacherReaction, type ScoreDimension } from "@/lib/vocal-exercise";
import type { ExerciseResultPayload } from "@/lib/exercise-result-payload";

const W = 1080;
const H = 1480;

const COLORS = {
  bg: "#0a0a0f",
  purple: "rgba(192, 132, 252, 0.24)",
  gold: "rgba(251, 191, 36, 0.14)",
  text: "#ffffff",
  muted: "#9ca3af",
  accent: "#e9d5ff",
  goldText: "#fbbf24",
  border: "rgba(255,255,255,0.12)",
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillMetric(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: number,
  x: number,
  y: number,
  width: number
) {
  roundRect(ctx, x, y, width, 168, 28);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText(label, x + width / 2, y + 48);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 56px Georgia, serif";
  ctx.fillText(String(value), x + width / 2, y + 118);
}

export async function renderExerciseResultPng(input: {
  studentName: string;
  payload: ExerciseResultPayload;
  weakest: ScoreDimension;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const reaction = teacherReaction(input.payload.overall, input.weakest);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, 460);
  glow.addColorStop(0, COLORS.purple);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.14, H * 0.86, 0, W * 0.14, H * 0.86, 400);
  glow2.addColorStop(0, COLORS.gold);
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  try {
    const logo = await loadImage("/icons/logo.png");
    const logoSize = 96;
    ctx.save();
    roundRect(ctx, W / 2 - logoSize / 2, 56, logoSize, logoSize, 22);
    ctx.clip();
    ctx.drawImage(logo, W / 2 - logoSize / 2, 56, logoSize, logoSize);
    ctx.restore();
  } catch {
    /* logo optional */
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.goldText;
  ctx.font = "600 20px Georgia, serif";
  ctx.fillText("UNIQUE VOCAL STUDIO", W / 2, 186);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText("Результаты упражнения", W / 2, 228);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 48px Georgia, serif";
  ctx.fillText(input.studentName.trim() || "Ученик", W / 2, 292);

  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText(input.payload.exerciseTitle || "Упражнение", W / 2, 340);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(input.payload.phraseTitle || "Фраза", W / 2, 378);

  try {
    const avatar = await loadImage(reaction.avatar);
    ctx.drawImage(avatar, W / 2 - 120, 410, 240, 240);
  } catch {
    /* avatar optional */
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 120px Georgia, serif";
  ctx.fillText(String(input.payload.overall), W / 2, 740);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillText("из 100", W / 2, 786);

  ctx.fillStyle = COLORS.goldText;
  ctx.font = "600 32px Georgia, serif";
  ctx.fillText(reaction.title, W / 2, 846);

  const gap = 24;
  const cardW = (W - 160 - gap * 2) / 3;
  fillMetric(ctx, "Мелодия", input.payload.intonation, 80, 890, cardW);
  fillMetric(ctx, "Ритм", input.payload.rhythm, 80 + cardW + gap, 890, cardW);
  fillMetric(ctx, "Полнота", input.payload.completeness, 80 + (cardW + gap) * 2, 890, cardW);

  if (input.payload.shift) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText(
      `Учтена транспозиция: ${input.payload.shift > 0 ? "+" : ""}${input.payload.shift} полутонов`,
      W / 2,
      1110
    );
  }

  roundRect(ctx, 80, 1150, W - 160, 220, 28);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Комментарий преподавателя", W / 2, 1204);
  ctx.fillStyle = COLORS.text;
  ctx.font = "400 24px system-ui, sans-serif";
  const words = reaction.message.split(/\s+/);
  let line = "";
  let y = 1250;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > W - 240 && line) {
      ctx.fillText(line, W / 2, y);
      line = word;
      y += 34;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, W / 2, y);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("uniquevocal.ru", W / 2, H - 56);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PNG export failed"))),
      "image/png",
      1
    );
  });
  return blob;
}
