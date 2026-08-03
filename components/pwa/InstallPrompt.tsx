"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone) return;

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    const installed = () => setInstallEvent(null);

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
    else setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-studio-card p-4 ring-1 ring-studio-accent/40 shadow-card">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-studio-accent/15">
        <Download className="h-5 w-5 text-studio-accent-light" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Установить Unique Vocal Studio</p>
        <p className="text-xs text-studio-muted">Быстрый запуск и push-уведомления</p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-xl bg-studio-accent px-3 py-2 text-xs font-medium text-white"
      >
        Установить
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-lg p-1 text-studio-muted hover:text-white"
        aria-label="Закрыть предложение установки"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
