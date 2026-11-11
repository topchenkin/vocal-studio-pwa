"use client";

import { ExternalLink, MicOff } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  isAndroid,
  isMicDeniedMessage,
  isStandaloneApp,
  openSiteInAndroidChrome,
} from "@/lib/mic-audio";

export default function MicDeniedHelp({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const android = isAndroid();
  const pwa = isStandaloneApp();
  const openChrome = android && pwa;

  return (
    <div className="mt-4 w-full max-w-[100vw] space-y-3 overflow-x-hidden rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-400/30">
      <div className="flex items-start gap-2">
        <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <p className="min-w-0 break-words text-sm font-medium text-amber-100">
          {message}
        </p>
      </div>
      {openChrome ? (
        <>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-studio-muted">
            <li>Нажмите «Открыть в Chrome».</li>
            <li>
              Разрешите микрофон, если спросит. Если не спросит: замочек у
              адреса → Микрофон → Разрешить.
            </li>
            <li>
              Вернитесь в приложение Unique Vocal Studio и нажмите ещё раз.
            </li>
          </ol>
          <p className="text-xs text-studio-muted">
            Если Chrome тоже отказывает: Настройки телефона → Приложения →
            Unique Vocal Studio → Разрешения → Микрофон.
          </p>
        </>
      ) : android ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-studio-muted">
          <li>Нажмите на замочек слева от адреса uniquevocal.ru.</li>
          <li>Микрофон → Разрешить.</li>
          <li>Нажмите «Повторить».</li>
        </ol>
      ) : null}
      <div className="flex w-full flex-wrap gap-2">
        {openChrome ? (
          <Button fullWidth className="sm:w-auto" onClick={() => openSiteInAndroidChrome()}>
            <ExternalLink className="h-4 w-4" />
            Открыть в Chrome
          </Button>
        ) : null}
        {onRetry ? (
          <Button
            fullWidth
            className="sm:w-auto"
            variant={openChrome ? "secondary" : "primary"}
            onClick={onRetry}
          >
            Повторить
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function MicErrorBlock({
  error,
  onRetry,
}: {
  error: string | null | undefined;
  onRetry?: () => void;
}) {
  if (!error) return null;
  if (isMicDeniedMessage(error)) {
    return <MicDeniedHelp message={error} onRetry={onRetry} />;
  }
  return (
    <p className="mt-4 break-words text-sm text-red-400">{error}</p>
  );
}
