import {
  formatGiftCode,
  giftIncludesLine,
  GIFT_ACTIVATION_STEPS,
  GIFT_KIND_LABELS,
  type GiftCertificate,
} from "@/lib/gift-certificates";

const W = 1080;
const H = 1520;

const COLORS = {
  bg: "#0a0a0f",
  purple: "rgba(192, 132, 252, 0.22)",
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
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  for (let i = 0; i < words.length; i += 1) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = words[i];
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
  return cursorY + lineHeight;
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

export async function renderGiftCertificatePng(
  cert: GiftCertificate
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.82, H * 0.08, 0, W * 0.82, H * 0.08, 420);
  glow.addColorStop(0, COLORS.purple);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.12, H * 0.88, 0, W * 0.12, H * 0.88, 380);
  glow2.addColorStop(0, COLORS.gold);
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  try {
    const logo = await loadImage("/icons/logo.png");
    const logoSize = 112;
    ctx.save();
    roundRect(ctx, W / 2 - logoSize / 2, 72, logoSize, logoSize, 22);
    ctx.clip();
    ctx.drawImage(logo, W / 2 - logoSize / 2, 72, logoSize, logoSize);
    ctx.restore();
  } catch {
    /* logo optional */
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.goldText;
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText("UNIQUE VOCAL STUDIO", W / 2, 230);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("Подарочный сертификат", W / 2, 272);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 18px system-ui, sans-serif";
  ctx.fillText("Получатель", W / 2, 360);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 64px Georgia, serif";
  const nameLines = cert.recipient_name.trim().split(/\s+/);
  let nameY = 440;
  for (const part of nameLines.slice(0, 3)) {
    ctx.fillText(part, W / 2, nameY);
    nameY += 72;
  }

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.18, nameY + 16);
  ctx.lineTo(W * 0.82, nameY + 16);
  ctx.stroke();

  ctx.fillStyle = COLORS.accent;
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText(GIFT_KIND_LABELS[cert.kind], W / 2, nameY + 72);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  wrapText(ctx, giftIncludesLine(cert), W * 0.12, nameY + 118, W - 240, 32);

  const codeY = nameY + 220;
  roundRect(ctx, W * 0.12, codeY, W * 0.76, 132, 24);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText("КОД АКТИВАЦИИ", W / 2, codeY + 42);

  ctx.fillStyle = COLORS.goldText;
  ctx.font = "700 44px ui-monospace, monospace";
  ctx.fillText(formatGiftCode(cert.code), W / 2, codeY + 96);

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText("Как активировать", W * 0.12, codeY + 190);

  ctx.font = "400 20px system-ui, sans-serif";
  let stepY = codeY + 232;
  GIFT_ACTIVATION_STEPS.forEach((step, index) => {
    ctx.fillStyle = COLORS.goldText;
    ctx.fillText(`${index + 1}.`, W * 0.12, stepY);
    ctx.fillStyle = COLORS.text;
    stepY = wrapText(ctx, step, W * 0.16, stepY, W - 220, 30);
    stepY += 8;
  });

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("uniquevocal.ru", W / 2, H - 72);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PNG export failed"))),
      "image/png",
      1
    );
  });
  return blob;
}

export function giftCertificateFilename(cert: GiftCertificate) {
  const slug = cert.recipient_name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `unique-vocal-gift-${slug || "certificate"}.png`;
}

export async function downloadGiftCertificatePng(cert: GiftCertificate) {
  const blob = await renderGiftCertificatePng(cert);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = giftCertificateFilename(cert);
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function shareGiftCertificatePng(cert: GiftCertificate) {
  const blob = await renderGiftCertificatePng(cert);
  const file = new File([blob], giftCertificateFilename(cert), {
    type: "image/png",
  });
  const shareData = {
    files: [file],
    title: `Подарок для ${cert.recipient_name}`,
    text: `Unique Vocal Studio · код ${formatGiftCode(cert.code)}`,
  };
  if (navigator.share && navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return "shared" as const;
  }
  await downloadGiftCertificatePng(cert);
  return "downloaded" as const;
}
