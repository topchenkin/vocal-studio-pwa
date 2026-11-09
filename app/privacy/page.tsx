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
            Обработка персональных данных · редакция от {LEGAL.privacyDate}
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            1. Оператор
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Оператор персональных данных: {LEGAL.fullName}, {LEGAL.status}, ИНН{" "}
            {LEGAL.inn}, г. {LEGAL.city}. Обращения: чат приложения или email{" "}
            <a
              className="text-studio-accent-light underline"
              href={`mailto:${LEGAL.email}`}
            >
              {LEGAL.email}
            </a>
            . Адрес занятий: проспект Ленина, 50Ж, {LEGAL.city}.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            2. Какие данные обрабатываются
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Имя, адрес электронной почты, номер телефона (нужен, чтобы
            преподаватель мог связаться по занятиям), данные учётной записи,
            сведения об оплаченных услугах и задолженности, ответы квиза на
            сайте, если вы его прошли, технические данные устройства и журналы
            работы приложения (входы в кабинет и ошибки приложения — без
            содержимого полей, пароля, сообщений чата, нажатий и без записи
            экрана),
            токен push-уведомлений (если вы их включили).
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Если вы пользуетесь упражнениями, чатом или ИИ-инструментами, могут
            обрабатываться голосовые записи, тексты сообщений и результаты
            разбора голоса. Полные реквизиты банковской карты Исполнитель не
            хранит: оплату принимают платёжные сервисы.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            3. Для чего нужны данные
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Заключение и исполнение договора об оказании услуг, доступ в личный
            кабинет, расписание и связь с преподавателем, приём оплаты, выдача
            чека НПД, уведомления о занятиях и платежах, работа упражнений и
            ИИ-инструментов по запросу пользователя, исполнение требований
            закона.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            4. Правовые основания
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Обработка ведётся в соответствии с Федеральным законом от 27.07.2006
            № 152-ФЗ: для исполнения договора, законных обязанностей оператора и
            при наличии согласия, если оно требуется (регистрация кабинета,
            необязательные ИИ-инструменты, push-уведомления).
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            5. Где хранятся данные
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Учётные записи, профили, расписание, чат, файлы и сведения об оплате
            записываются и хранятся на собственном сервере Исполнителя в Москве
            (VPS Timeweb). Доступ к этому серверу — через домен{" "}
            <span className="whitespace-nowrap">sb.uniquevocal.ru</span>. Это не
            облако supabase.com: база и хранилище работают на оборудовании в
            Российской Федерации.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            6. Передача третьим лицам
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Данные передаются только если это нужно для услуги или закона.
            Исполнитель не продаёт персональные данные и не использует счётчики
            посещаемости.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              Robokassa — приём оплаты из РФ, в том числе через СБП. По решению
              Исполнителя может использоваться ЮKassa.
            </li>
            <li>
              Prodamus — если вы сами выбираете оплату картой, выпущенной вне
              РФ.
            </li>
            <li>
              ФНС / «Мой налог» — учёт дохода самозанятого и чек НПД.
            </li>
            <li>
              Хостинг Timeweb (Москва) — сервер сайта и базы.
            </li>
            <li>
              Сервис доставки писем (Resend) — письма о входе, пароле и
              сервисные уведомления, которые не удалось доставить в приложение.
            </li>
            <li>
              Groq — если вы открываете ИИ-автора песен: на обработку уходит
              текст запроса.
            </li>
            <li>
              Hugging Face — если вы запускаете разбор голоса или снятие
              минусовки: на обработку уходит загруженный вами звук.
            </li>
            <li>
              Служба push браузера (при включённых уведомлениях) — доставка
              сообщения на устройство.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed">
            Часть этих сервисов находится за пределами РФ. Передача нужна, чтобы
            оказать выбранную вами функцию (письмо, оплата зарубежной картой,
            ИИ-инструмент). Без запуска этой функции данные туда не отправляются.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            7. Файлы cookie и счётчики
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Исполнитель не ставит рекламные и аналитические cookie и не
            использует Яндекс Метрику, вебвизор и аналогичные счётчики. Для
            входа в кабинет сессия хранится в браузере (localStorage) — это нужно,
            чтобы вы оставались авторизованы.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Плеер Яндекс Музыки на странице преподавателя загружается только
            после вашего нажатия «Показать плеер». До этого cookie Яндекса не
            ставятся. Ссылка «Открыть на Яндекс Картах» открывает карты в новой
            вкладке, виджет карт на Сайте не встраивается.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            8. Срок хранения и удаление
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Данные хранятся, пока действует учётная запись, и столько, сколько
            нужно для бухгалтерии, налогов и защиты прав, затем удаляются или
            обезличиваются, если закон не требует большего срока. Технические
            журналы работы приложения хранятся до 30 дней и нужны, чтобы
            разбирать сбои и обращения учеников.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Чтобы удалить данные, напишите в чат приложения или на{" "}
            <a
              className="text-studio-accent-light underline"
              href={`mailto:${LEGAL.email}`}
            >
              {LEGAL.email}
            </a>
            . Запрос рассматриваем в разумный срок, обычно до 30 календарных
            дней. Кабинет закрывается. Сообщения чата могут быть обезличены, а
            не стёрты сразу, если это нужно для спора об оказанной услуге или
            требований закона.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            9. Права пользователя
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Можно запросить доступ, уточнение, ограничение обработки или
            удаление данных, а также отозвать согласие, если обработка на нём
            основана. Можно подать жалобу в Роскомнадзор.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            10. Дети
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Кабинет создаёт совершеннолетний Заказчик. Если ученику нет 18 лет,
            регистрируется законный представитель. Если ученику нет 14 лет,
            согласие на обработку его данных даёт только законный представитель.
            На занятиях для детей представитель указывает свои контакты.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">
            11. Защита
          </h2>
          <p className="mt-3 text-sm leading-relaxed">
            Применяются организационные и технические меры: HTTPS, разграничение
            доступа, хранение паролей в виде хеша через сервис аутентификации на
            собственном сервере в РФ.
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
