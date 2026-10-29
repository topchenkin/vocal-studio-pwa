import { CAT_LEVEL_LABELS } from "@/lib/cat-levels";
import { STUDIO_PLACE, TRIAL_LESSON, formatRub } from "@/lib/public-site";
import type { CatLevel, IntroQuizRow } from "@/types";

export type IntroQuizAnswers = Pick<
  IntroQuizRow,
  "goal" | "experience" | "barrier" | "outcome" | "format"
>;

export type IntroQuizKey = keyof IntroQuizAnswers;

interface QuizQuestion {
  key: IntroQuizKey;
  title: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export const INTRO_QUIZ_QUESTIONS: ReadonlyArray<QuizQuestion> = [
  {
    key: "goal",
    title: "Зачем вам вокал?",
    options: [
      { value: "soul", label: "Для себя / петь любимые песни" },
      { value: "event", label: "Выступить на событии: свадьба, концерт, корпоратив" },
      { value: "record", label: "Записать песню" },
      { value: "stage", label: "Сцена или профессия" },
    ],
  },
  {
    key: "experience",
    title: "Был ли у вас опыт пения?",
    options: [
      { value: "never", label: "Никогда не пел(а)" },
      { value: "self", label: "Пою сам(а) для себя" },
      { value: "before", label: "Занимался(-лась) раньше" },
      { value: "perform", label: "Выступаю или выступал(а)" },
    ],
  },
  {
    key: "barrier",
    title: "Что сильнее всего мешает начать?",
    options: [
      { value: "ear", label: "Кажется, что нет слуха" },
      { value: "shy", label: "Стесняюсь своего голоса" },
      { value: "late", label: "Думаю, что уже поздно" },
      { value: "time", label: "Не хватает времени" },
      { value: "none", label: "Ничего не мешает" },
    ],
  },
  {
    key: "outcome",
    title: "Чего хочется через 3 месяца?",
    options: [
      { value: "song", label: "Уверенно спеть любимую песню" },
      { value: "pitch", label: "Чисто попадать в ноты" },
      { value: "range", label: "Расширить диапазон" },
      { value: "fear", label: "Выйти на публику без страха" },
      { value: "ease", label: "Петь без напряжения" },
    ],
  },
  {
    key: "format",
    title: "Как удобнее заниматься?",
    options: [
      { value: "city", label: "Лично в Екатеринбурге" },
      { value: "online", label: "Онлайн по видеосвязи" },
    ],
  },
];

/** Short labels for the teacher card in the admin panel. */
export const INTRO_QUIZ_LABELS: Record<IntroQuizKey, Record<string, string>> =
  Object.fromEntries(
    INTRO_QUIZ_QUESTIONS.map((q) => [
      q.key,
      Object.fromEntries(q.options.map((o) => [o.value, o.label])),
    ])
  ) as Record<IntroQuizKey, Record<string, string>>;

export const INTRO_QUIZ_TITLES: Record<IntroQuizKey, string> = {
  goal: "Цель",
  experience: "Опыт",
  barrier: "Что мешает начать",
  outcome: "Через 3 месяца",
  format: "Формат",
};

const EXPERIENCE_LEVEL: Record<IntroQuizAnswers["experience"], CatLevel> = {
  never: "beginner",
  self: "basic",
  before: "basic",
  perform: "pro",
};

const LEVEL_LEAD: Record<"beginner" | "basic" | "pro", string> = {
  beginner:
    "Начинаем с нуля — это хорошая точка старта. Голос раскрывается правильно с первых занятий, без лишних привычек.",
  basic:
    "Голос уже звучит. Дальше — опора, чистота интонации и уверенность на всём диапазоне.",
  pro: "Опыт на сцене у вас уже есть. Работаем над деталями: тембр, дыхание, стабильность и подача.",
};

const BARRIER_ANSWER: Record<IntroQuizAnswers["barrier"], string> = {
  ear: "«Нет слуха» чаще всего оказывается недотренированным слухом: он развивается упражнениями. На пробном уроке мы это услышим на вашем голосе.",
  shy: "Стеснение проходит в спокойной обстановке: на уроке только вы и преподаватель, и никто вас не оценивает.",
  late: "Начать можно в любом возрасте: голос — это навык, и он тренируется. Важна регулярность, а не возраст.",
  time: "Достаточно небольших шагов: занятия по расписанию и короткие упражнения в кабинете между уроками.",
  none: "Отлично — значит, можно сразу переходить к делу.",
};

const STEP_BY_EXPERIENCE: Record<IntroQuizAnswers["experience"], string> = {
  never: "Знакомство с голосом и дыханием: учимся слышать себя и снимать зажимы.",
  self: "Разбор того, как вы поёте сейчас: что получается и где голос устаёт.",
  before: "Проверяем базу — дыхание, опору, чистоту интонации — и закрываем пробелы.",
  perform: "Разбор вашего репертуара и подачи: что усилить, а что убрать.",
};

const STEP_BY_GOAL: Record<IntroQuizAnswers["goal"], string> = {
  soul: "Берём песни, которые вам нравятся, и учимся петь их свободно.",
  event: "Подбираем номер для выступления и репетируем его от начала до конца.",
  record: "Готовим песню к записи: интонация, дикция, эмоция.",
  stage: "Ставим голос и подачу под сцену: выносливость, микрофон, образ.",
};

const STEP_BY_OUTCOME: Record<IntroQuizAnswers["outcome"], string> = {
  song: "Цель на 3 месяца: уверенно спеть вашу любимую песню.",
  pitch: "Цель на 3 месяца: чисто попадать в ноты — развиваем слух и контроль голоса.",
  range: "Цель на 3 месяца: расширить диапазон без напряжения и срывов.",
  fear: "Цель на 3 месяца: выйти на публику без страха — тренируем уверенность шаг за шагом.",
  ease: "Цель на 3 месяца: петь без зажимов и усталости голоса.",
};

const GOAL_SHORT: Record<IntroQuizAnswers["goal"], string> = {
  soul: "петь для себя",
  event: "выступить на событии",
  record: "записать песню",
  stage: "сцена и профессия",
};

export interface IntroQuizResult {
  catLevel: CatLevel;
  catLabel: string;
  headline: string;
  lead: string;
  goalLine: string;
  barrierAnswer: string;
  steps: string[];
  trialLine: string;
}

export function computeIntroQuizResult(a: IntroQuizAnswers): IntroQuizResult {
  const catLevel = EXPERIENCE_LEVEL[a.experience];
  const catLabel = CAT_LEVEL_LABELS[catLevel];
  const leadKey = catLevel === "star" ? "pro" : catLevel;
  const place =
    a.format === "city"
      ? `Лично в «${STUDIO_PLACE.nameIn}», ${STUDIO_PLACE.street}.`
      : "Онлайн по видеосвязи, время подберём с учётом вашего часового пояса.";
  return {
    catLevel,
    catLabel,
    headline: `Вы — ${catLabel}`,
    lead: LEVEL_LEAD[leadKey],
    goalLine: `Ваша цель: ${GOAL_SHORT[a.goal]}.`,
    barrierAnswer: BARRIER_ANSWER[a.barrier],
    steps: [
      STEP_BY_EXPERIENCE[a.experience],
      STEP_BY_GOAL[a.goal],
      STEP_BY_OUTCOME[a.outcome],
    ],
    trialLine: `Пробный урок — ${TRIAL_LESSON.minutes} минут, ${formatRub(
      TRIAL_LESSON.price
    )}. ${place}`,
  };
}

const STORAGE_KEY = "uvs_intro_quiz_v1";

function isAnswers(value: unknown): value is IntroQuizAnswers {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return INTRO_QUIZ_QUESTIONS.every((q) => {
    const v = obj[q.key];
    return typeof v === "string" && q.options.some((o) => o.value === v);
  });
}

/** Answers wait here until the visitor signs up; the cabinet then saves them to the database. */
export function loadPendingIntroQuiz(): IntroQuizAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAnswers(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingIntroQuiz(answers: IntroQuizAnswers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch (error) {
    console.error("[uvs:intro-quiz] cannot keep answers in the browser", error);
  }
}

export function clearPendingIntroQuiz(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage can be blocked; nothing to clean */
  }
}
