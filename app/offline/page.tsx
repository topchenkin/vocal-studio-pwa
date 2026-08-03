export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-studio-card ring-1 ring-studio-border">
        <svg
          className="h-8 w-8 text-studio-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 12h.01"
          />
        </svg>
      </div>
      <h1 className="font-display text-2xl font-semibold">Нет соединения</h1>
      <p className="mt-2 max-w-xs text-studio-muted">
        Проверьте интернет и попробуйте снова. Приложение будет доступно офлайн
        после первой загрузки.
      </p>
    </main>
  );
}
