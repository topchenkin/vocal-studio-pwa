export const VOCAL_CAT_STICKERS = [
  {
    id: "cat-sing",
    src: "/stickers/sticker-cat-sing.png",
    label: "Поёт",
  },
  {
    id: "cat-headphones",
    src: "/stickers/sticker-cat-headphones.png",
    label: "В наушниках",
  },
  {
    id: "cat-heart",
    src: "/stickers/sticker-cat-heart.png",
    label: "Люблю",
  },
  {
    id: "cat-fire",
    src: "/stickers/sticker-cat-fire.png",
    label: "Огонь",
  },
  {
    id: "cat-star",
    src: "/stickers/sticker-cat-star.png",
    label: "Звезда",
  },
  {
    id: "cat-ok",
    src: "/stickers/sticker-cat-ok.png",
    label: "Ок",
  },
  {
    id: "cat-think",
    src: "/stickers/sticker-cat-think.png",
    label: "Думаю",
  },
  {
    id: "cat-wave",
    src: "/stickers/sticker-cat-wave.png",
    label: "Привет",
  },
] as const;

export type VocalCatStickerId = (typeof VOCAL_CAT_STICKERS)[number]["id"];

export function getSticker(id: string) {
  return VOCAL_CAT_STICKERS.find((item) => item.id === id) ?? null;
}

/** Compact vocal-studio reactions for the emoji panel (not generic faces). */
export const CHAT_EMOJIS = [
  "🎤",
  "🎶",
  "🎵",
  "🎼",
  "🎧",
  "🎹",
  "🎸",
  "🥁",
  "✨",
  "💫",
  "🌟",
  "⭐",
  "🔥",
  "💯",
  "💜",
  "💗",
  "👏",
  "🙌",
  "💪",
  "👍",
  "😻",
  "😺",
  "😸",
  "😹",
];
