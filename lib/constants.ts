import type { SubscriptionPlan, User, Lesson, Notification, Note, ChatMessage } from "./types";

export const APP_NAME = "Unique Vocal Studio";
export const APP_SHORT_NAME = "Unique Vocal";
export const NOTIFICATION_APP_NAME = "Unique Vocal";

/** Публичные цены подписки на приложение (₽ / месяц), как в каталоге услуг. */
export const APP_TIER_PRICES = {
  standard: 990,
  premium: 1990,
  vip: 3990,
} as const;

export const DUO_TIER_PRICES = {
  standard: 1490,
  premium: 2990,
  vip: 5990,
} as const;

export const PLANS: SubscriptionPlan[] = [
  {
    id: "standard",
    duration: "Standard · 1 месяц",
    months: 1,
    price: APP_TIER_PRICES.standard,
    pricePerMonth: APP_TIER_PRICES.standard,
  },
  {
    id: "premium",
    duration: "Premium · 1 месяц",
    months: 1,
    price: APP_TIER_PRICES.premium,
    pricePerMonth: APP_TIER_PRICES.premium,
    badge: "Популярный",
  },
  {
    id: "vip",
    duration: "VIP · 1 месяц",
    months: 1,
    price: APP_TIER_PRICES.vip,
    pricePerMonth: APP_TIER_PRICES.vip,
  },
];

export const ROLE_LABELS: Record<string, string> = {
  guest: "Гость",
  student_free: "Ученик Free",
  student_premium: "Ученик Premium",
  admin: "Админ",
};

export const LESSONS_PER_MONTH = 4;

export const BASIC_WARMUPS = [
  {
    id: "w1",
    title: "Дыхательная гимнастика",
    duration: "5:30",
    description: "Базовые упражнения для контроля дыхания",
  },
  {
    id: "w2",
    title: "Распевка «Ми-ма-ма»",
    duration: "4:15",
    description: "Разогрев голосовых связок",
  },
  {
    id: "w3",
    title: "Арpeggio 1-3-5-8",
    duration: "6:00",
    description: "Плавные переходы по нотам",
  },
];

export const PREMIUM_VIDEOS = [
  {
    id: "v1",
    title: "Техника belting",
    duration: "18:42",
    thumbnail: "belting",
  },
  {
    id: "v2",
    title: "Работа с микрофоном",
    duration: "22:10",
    thumbnail: "mic",
  },
  {
    id: "v3",
    title: "Импровизация и ad-lib",
    duration: "15:30",
    thumbnail: "improv",
  },
];

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function createInitialUsers(): User[] {
  return [
    {
      id: "admin-1",
      name: "Анна Петрова",
      email: "admin@uvs.ru",
      phone: "+7 900 000-00-01",
      role: "admin",
      createdAt: new Date().toISOString(),
    },
    {
      id: "student-free-1",
      name: "Мария Иванова",
      email: "maria@example.com",
      phone: "+7 900 111-22-33",
      role: "student_free",
      lessonsRemaining: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: "student-premium-1",
      name: "Алексей Смирнов",
      email: "alex@example.com",
      phone: "+7 900 444-55-66",
      role: "student_premium",
      subscriptionEnd: daysFromNow(45),
      lessonsRemaining: 8,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createInitialLessons(): Lesson[] {
  return [
    {
      id: "l1",
      studentId: "student-premium-1",
      studentName: "Алексей Смирнов",
      date: daysFromNow(1),
      time: "14:00",
      status: "booked",
      duration: 60,
    },
    {
      id: "l2",
      studentId: "student-premium-1",
      studentName: "Алексей Смирнов",
      date: daysFromNow(8),
      time: "16:00",
      status: "booked",
      duration: 60,
    },
    { id: "l3", date: daysFromNow(2), time: "10:00", status: "available", duration: 60 },
    { id: "l4", date: daysFromNow(2), time: "12:00", status: "available", duration: 60 },
    { id: "l5", date: daysFromNow(3), time: "11:00", status: "available", duration: 60 },
    { id: "l6", date: daysFromNow(3), time: "15:00", status: "available", duration: 60 },
    { id: "l7", date: daysFromNow(5), time: "14:00", status: "available", duration: 60 },
    { id: "l8", date: daysFromNow(5), time: "18:00", status: "available", duration: 60 },
  ];
}

export function createInitialNotifications(): Notification[] {
  return [
    {
      id: "n1",
      userId: "student-premium-1",
      title: "Напоминание",
      message: "Ваш урок завтра в 14:00",
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "n2",
      userId: "student-premium-1",
      title: "Домашнее задание",
      message: "Преподаватель оставил новый комментарий",
      read: false,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

export function createInitialNotes(): Note[] {
  return [
    {
      id: "note-1",
      studentId: "student-premium-1",
      homework: "Отработать распевку «Ми-ма-ма» 10 минут ежедневно. Записать себя на диктофон.",
      teacherComment:
        "Отличный прогресс! Обратите внимание на поддержку диафрагмы в верхнем регистре.",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "note-2",
      studentId: "student-free-1",
      homework: "Прослушать базовые распевки и повторить упражнения на дыхание.",
      teacherComment: "Добро пожаловать! Начните с базовых материалов в разделе «Обучение».",
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function createInitialChat(): ChatMessage[] {
  return [
    {
      id: "c1",
      chatId: "student-premium-1",
      senderId: "student-premium-1",
      senderName: "Алексей Смирнов",
      text: "Здравствуйте! Можно перенести урок на следующую неделю?",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "c2",
      chatId: "student-premium-1",
      senderId: "admin-1",
      senderName: "Анна Петрова",
      text: "Конечно! Выберите удобный слот в расписании или напишите желаемое время.",
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ];
}
