import type { FaqItem } from "@/lib/public-site";

/** Native <details>: answers stay in the static HTML for search and need no JS. */
export default function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section className="py-12">
      <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl">
        Частые вопросы
      </h2>
      <div className="mx-auto mt-8 max-w-3xl space-y-3">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl bg-studio-surface px-5 py-4 ring-1 ring-studio-border open:ring-studio-accent/40"
          >
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-studio-accent transition group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-studio-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
