import Badge from "@/components/ui/Badge";
import { AuthCta } from "@/components/landing/PublicAuth";
import {
  REGULAR_LESSON_FROM_PRICE,
  TRIAL_LESSON,
  formatRub,
} from "@/lib/public-site";

const STEPS = [
  "Создаёте бесплатный кабинет — это занимает минуту.",
  "Преподаватель связывается с вами и согласует время: онлайн или очно.",
  "Проходите пробный урок и оплачиваете его в кабинете.",
] as const;

export default function TrialCard({ id }: { id?: string }) {
  return (
    <section
      id={id}
      className="scroll-mt-10 rounded-3xl bg-gradient-to-r from-studio-accent/10 via-studio-card to-blue-500/10 p-6 ring-1 ring-studio-border sm:p-10"
    >
      <div className="grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <Badge>Для новых учеников</Badge>
          <h2 className="mt-4 font-display text-3xl font-semibold sm:text-4xl">
            Пробный урок — {formatRub(TRIAL_LESSON.price)}
          </h2>
          <p className="mt-3 text-studio-muted">
            {TRIAL_LESSON.minutes} минут: знакомимся, слушаем голос, определяем
            уровень и цели и намечаем план занятий.
          </p>
          <p className="mt-3 text-sm text-studio-muted">
            Регулярные занятия — от {formatRub(REGULAR_LESSON_FROM_PRICE)}.
            Подписка на приложение не требуется.
          </p>
          <AuthCta
            className="cta-shimmer mt-6 w-full sm:w-auto"
            size="lg"
          >
            Записаться на пробный
          </AuthCta>
        </div>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-2xl bg-studio-surface/80 p-4 ring-1 ring-studio-border"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-studio-accent/15 text-sm font-semibold text-studio-accent-light ring-1 ring-studio-accent/30">
                {index + 1}
              </span>
              <span className="pt-1 text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
