import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import RequisitesCard from "@/components/legal/RequisitesCard";
import SiteFooter from "@/components/legal/SiteFooter";
import { APP_NAME } from "@/lib/constants";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Политика конфиденциальности — ${APP_NAME}`,
  description:
    "Политика обработки персональных данных Unique Vocal Studio (152-ФЗ).",
  alternates: { canonical: LEGAL.privacyPath },
};

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-hero-glow" />
      <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-5 sm:px-6">
        <Header />
        <article className="mt-10 rounded-3xl bg-studio-card/60 p-5 ring-1 ring-studio-border sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-studio-gold">
            Документы
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            Политика конфиденциальности
          </h1>
          <p className="mt-2 text-sm text-studio-muted">
            Обработка персональных данных · редакция от {LEGAL.offerDate}
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            1. Оператор
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Оператор персональных данных: {LEGAL.fullName}, {LEGAL.status}, ИНН{" "}
            {LEGAL.inn}, г. {LEGAL.city}. Контакты: {LEGAL.phone}, {LEGAL.email}.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            2. Какие данные обрабатываются
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Имя, адрес электронной почты, номер телефона (если указан), данные
            учётной записи, сведения об оплаченных услугах и задолженности,
            технические данные устройства и журналы работы приложения. Полные
            реквизиты банковской карты Исполнитель не хранит: оплату принимает
            платёжный сервис Robokassa.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            3. Для чего нужны данные
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Заключение и исполнение договора об оказании услуг, доступ в личный
            кабинет, расписание и связь с преподавателем, приём оплаты, выдача
            чека НПД, уведомления о занятиях и платежах, исполнение требований
            закона.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            4. Правовые основания
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Обработка ведётся в соответствии с Федеральным законом от 27.07.2006
            № 152-ФЗ: для исполнения договора, законных обязанностей оператора и
            при наличии согласия, если оно требуется.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            5. Передача третьим лицам
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Данные передаются только если это нужно для услуги или закона: сервис
            Robokassa (расчёты), хостинг и инфраструктура Сайта, ФНС / «Мой
            налог» (учёт дохода и чек). Исполнитель не продаёт персональные
            данные.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            6. Срок хранения
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Данные хранятся, пока действует учётная запись и столько, сколько
            нужно для бухгалтерии, налогов и защиты прав, затем удаляются или
            обезличиваются, если закон не требует большего срока.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            7. Права пользователя
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Можно запросить доступ, уточнение, ограничение обработки или
            удаление данных, а также отозвать согласие, если обработка на нём
            основана. Обращение: {LEGAL.email} или {LEGAL.phone}. Можно подать
            жалобу в Роскомнадзор.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            8. Защита
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Применяются организационные и технические меры: HTTPS, разграничение
            доступа, хранение паролей в виде хеша через сервис аутентификации.
            Сайт не предназначен для лиц младше 18 лет без участия законного
            представителя.
          </p>

          <div className="mt-8">
            <RequisitesCard />
          </div>
          <p className="mt-6 text-xs text-studio-muted">
            <Link href={LEGAL.offerPath} className="underline">
              Публичная оферта
            </Link>
            {" · "}
            <Link href="/" className="underline">
              На главную
            </Link>
          </p>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
