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
        <dt className="text-studio-muted">Город</dt>
        <dd>{LEGAL.city}</dd>
      </dl>
    </div>
  );
}
