import { LEGAL } from "@/lib/legal";

export default function RequisitesCard() {
  return (
    <div className="rounded-2xl bg-studio-surface p-4 text-sm ring-1 ring-studio-border sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-studio-gold">
        Реквизиты
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr]">
        <dt className="text-studio-muted">Исполнитель</dt>
        <dd>{LEGAL.fullName}</dd>
        <dt className="text-studio-muted">Статус</dt>
        <dd>Самозанятый (НПД)</dd>
        <dt className="text-studio-muted">ИНН</dt>
        <dd>{LEGAL.inn}</dd>
        <dt className="text-studio-muted">ОГРНИП</dt>
        <dd>не присваивается</dd>
        <dt className="text-studio-muted">Город</dt>
        <dd>{LEGAL.city}</dd>
        <dt className="text-studio-muted">Телефон</dt>
        <dd>
          <a className="text-studio-accent-light underline" href={LEGAL.phoneHref}>
            {LEGAL.phone}
          </a>
        </dd>
        <dt className="text-studio-muted">Email</dt>
        <dd>
          <a
            className="text-studio-accent-light underline"
            href={`mailto:${LEGAL.email}`}
          >
            {LEGAL.email}
          </a>
        </dd>
        <dt className="text-studio-muted">Связь</dt>
        <dd>{LEGAL.contactHours}</dd>
      </dl>
    </div>
  );
}
