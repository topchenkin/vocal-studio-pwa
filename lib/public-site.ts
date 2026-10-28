import { LEGAL } from "@/lib/legal";

/** Public marketing facts. One place, so landing pages, JSON-LD and FAQ never disagree. */
export const TRIAL_LESSON = { price: 1700, minutes: 30 } as const;
export const REGULAR_LESSON_FROM_PRICE = 2200;

export const STUDIO_PLACE = {
  name: "Свердловская Киностудия",
  /** Предложный падеж: «занимаемся в …». */
  nameIn: "Свердловской Киностудии",
  street: "ул. Ленина, 50Ж",
  area: "центр города",
  city: LEGAL.city,
  region: "Свердловская область",
} as const;

export const STUDIO_MAP_URL = `https://yandex.ru/maps/?text=${encodeURIComponent(
  "Свердловская киностудия, ул. Ленина 50Ж, Екатеринбург"
)}`;

export const PUBLIC_PATHS = {
  online: "/online",
  ekaterinburg: "/ekaterinburg",
} as const;

export function formatRub(value: number) {
  return `${value.toLocaleString("ru-RU")}\u00a0₽`;
}

export interface FaqItem {
  q: string;
  a: string;
}

const TRIAL_ANSWER = `Пробный урок длится ${TRIAL_LESSON.minutes} минут и стоит ${formatRub(
  TRIAL_LESSON.price
)}. Регулярные занятия — от ${formatRub(
  REGULAR_LESSON_FROM_PRICE
)}; точную стоимость назовём после пробного урока.`;

const FAQ_SIGNUP: FaqItem = {
  q: "Как записаться на пробный урок?",
  a: "Создайте кабинет — это бесплатно. Преподаватель свяжется с вами и согласует время и формат: онлайн или очно.",
};

const FAQ_EXPERIENCE: FaqItem = {
  q: "Нужен ли опыт или особый голос?",
  a: "Нет. Занимаются и те, кто никогда не пел, и те, у кого уже есть опыт. Программу строим под ваш уровень и цели.",
};

const FAQ_AGES: FaqItem = {
  q: "Для какого возраста подходят занятия?",
  a: "Занятия проходят и для взрослых, и для детей.",
};

export const FAQ_HOME: FaqItem[] = [
  { q: "Сколько стоит пробный урок?", a: TRIAL_ANSWER },
  FAQ_SIGNUP,
  {
    q: "Можно ли заниматься онлайн, если я живу не в Екатеринбурге?",
    a: "Да. Онлайн-занятия проходят по видеосвязи из любого города России, время подбираем с учётом вашего часового пояса.",
  },
  {
    q: "Где проходят очные занятия в Екатеринбурге?",
    a: `В «${STUDIO_PLACE.nameIn}», ${STUDIO_PLACE.street}, ${STUDIO_PLACE.area}.`,
  },
  FAQ_EXPERIENCE,
  FAQ_AGES,
  {
    q: "Обязательна ли подписка на приложение?",
    a: "Нет. Кабинет бесплатный. Подписка нужна только если хотите больше инструментов для практики между уроками.",
  },
];

export const FAQ_ONLINE: FaqItem[] = [
  { q: "Сколько стоит пробный урок онлайн?", a: TRIAL_ANSWER },
  {
    q: "Из каких городов можно заниматься?",
    a: "Из любого города России: нужен только интернет. Время занятий подбираем с учётом вашего часового пояса.",
  },
  {
    q: "Что нужно для онлайн-урока?",
    a: "Телефон, планшет или компьютер, стабильный интернет, наушники и тихое место, где можно петь.",
  },
  FAQ_SIGNUP,
  FAQ_EXPERIENCE,
  FAQ_AGES,
];

export const FAQ_EKATERINBURG: FaqItem[] = [
  { q: "Сколько стоит пробный урок?", a: TRIAL_ANSWER },
  {
    q: "Где находится студия?",
    a: `«${STUDIO_PLACE.name}», ${STUDIO_PLACE.street}, ${STUDIO_PLACE.city}, ${STUDIO_PLACE.area}.`,
  },
  FAQ_SIGNUP,
  FAQ_EXPERIENCE,
  FAQ_AGES,
  {
    q: "Можно ли начать онлайн, а потом перейти на очные занятия?",
    a: "Да, формат можно менять по договорённости с преподавателем.",
  },
];
