import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import RequisitesCard from "@/components/legal/RequisitesCard";
import SiteFooter from "@/components/legal/SiteFooter";
import { APP_NAME, APP_TIER_PRICES, DUO_TIER_PRICES } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Услуги и цены — ${APP_NAME}`,
  description:
    "Описание и стоимость услуг Unique Vocal Studio: подписка на приложение, Duo, занятия вокалом, оплата и возврат.",
  alternates: { canonical: LEGAL.uslugiPath },
};

const INDIVIDUAL = [
  { title: "Standard", price: APP_TIER_PRICES.standard, note: "1 месяц · ИИ-анализатор, чат, часть упражнений" },
  { title: "Premium", price: APP_TIER_PRICES.premium, note: "1 месяц · отзывы преподавателя, ИИ-минусовки, распевки" },
  { title: "VIP", price: APP_TIER_PRICES.vip, note: "1 месяц · студийный трек, безлимитный ИИ, всё из Premium" },
];

const DUO = [
  { title: "Standard Duo", price: DUO_TIER_PRICES.standard, note: "два аккаунта Standard" },
  { title: "Premium Duo", price: DUO_TIER_PRICES.premium, note: "два аккаунта Premium" },
  { title: "VIP Duo", price: DUO_TIER_PRICES.vip, note: "два аккаунта VIP" },
];

function rub(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export default function UslugiPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-5 sm:px-6">
        <Header />
        <article className="mt-10 rounded-3xl bg-studio-card/60 p-5 ring-1 ring-studio-border sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
            Для покупателя
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            Услуги, цены и возврат
          </h1>
          <p className="mt-2 text-sm text-studio-muted">
            Все цены в рублях РФ. НДС не начисляется (НПД). Комиссия СБП для
            ученика в цену не включена.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            Подписка на приложение
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Доступ к личному кабинету Unique Vocal: упражнения, чат с
            преподавателем, ИИ-инструменты в объёме тарифа. Срок указан у
            каждого тарифа.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {INDIVIDUAL.map((plan) => (
              <li
                key={plan.title}
                className="flex items-baseline justify-between gap-3 rounded-xl bg-studio-surface px-4 py-3 ring-1 ring-studio-border"
              >
                <span>
                  {plan.title}
                  <span className="text-studio-muted"> · {plan.note}</span>
                </span>
                <b>{rub(plan.price)}</b>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">Duo</h2>
          <p className="mt-3 text-sm leading-relaxed">
            Один платит, доступ получают два аккаунта.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {DUO.map((plan) => (
              <li
                key={plan.title}
                className="flex items-baseline justify-between gap-3 rounded-xl bg-studio-surface px-4 py-3 ring-1 ring-studio-border"
              >
                <span>
                  {plan.title}
                  <span className="text-studio-muted"> · {plan.note}</span>
                </span>
                <b>{rub(plan.price)}</b>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">
            Занятия вокалом и задолженность
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Индивидуальные и иные занятия, пакеты уроков и погашение
            задолженности. Цена занятия или пакета назначается преподавателем
            персонально и <b>показывается в личном кабинете до оплаты</b>.
            Задолженность оплачивается целиком, одной суммой, указанной в
            кабинете.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            Как получить услугу
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Физической доставки нет. После подтверждения оплаты подписка и
            цифровые материалы открываются в кабинете. Занятия проходят очно
            или онлайн в слот из расписания.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Оплата — безналично через Robokassa, способ СБП. Услуга считается
            оплаченной после подтверждения платежа сервисом.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            Отказ и возврат
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Возврат — по законодательству РФ, включая Закон «О защите прав
            потребителей», если услуга не оказана, оказана некачественно или с
            нарушением срока. Заявка: {LEGAL.email} или {LEGAL.phone}. Срок
            ответа — до 10 рабочих дней, перевод — вручную через платёжный
            сервис. Чек НПД при возврате корректируется.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Если цифровой доступ уже предоставлен и использован, возврат может
            быть ограничен правилами дистанционных договоров. Неявка на
            согласованное занятие без переноса не обязывает возвращать оплату
            за этот слот.
          </p>
          <p className="mt-3 text-sm">
            Полный текст:{" "}
            <Link href={LEGAL.offerPath} className="text-studio-accent-light underline">
              публичная оферта
            </Link>
            .
          </p>

          <div className="mt-8">
            <RequisitesCard />
          </div>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
