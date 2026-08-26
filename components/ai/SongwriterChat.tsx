"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, PenLine, Send, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { getChatSessionToken } from "@/lib/chat-media";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const CHIPS = [
  "Написать хит про осень",
  "Помоги с рифмой к слову...",
  "Как структурировать песню?",
] as const;

type ChatOk = { reply?: string; error?: string; code?: string };

const API_TIMEOUT_MS = 60_000;

function abortAfter(ms: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => window.clearTimeout(timer),
  };
}

function humanizeError(code: string | undefined, fallback?: string) {
  switch (code) {
    case "premium_required":
      return "Твой личный ИИ-продюсер доступен в Premium.";
    case "unauthorized":
      return "Сессия истекла. Обновите страницу и войдите снова.";
    case "empty_prompt":
      return "Напишите, с чем помочь — тема, строка или рифма.";
    case "busy":
      return "Продюсер сейчас занят. Подождите несколько секунд и повторите.";
    case "timeout":
      return "Ответ занял слишком много времени. Попробуйте ещё раз.";
    case "missing_groq_key":
      return "Сервер автора песен не настроен. Напишите преподавателю.";
    default:
      if (fallback && /[А-Яа-яЁё]/.test(fallback)) return fallback;
      return "Не удалось получить ответ. Попробуйте ещё раз.";
  }
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, index) => (
        <p key={`${index}-${line.slice(0, 12)}`}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
            const bold = part.match(/^\*\*([^*]+)\*\*$/);
            if (bold) {
              return (
                <strong key={partIndex} className="font-semibold text-violet-50">
                  {bold[1]}
                </strong>
              );
            }
            return <span key={partIndex}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

type Props = {
  locked?: boolean;
};

export default function SongwriterChat({ locked }: Props) {
  const { tier, isAdmin } = useAuth();
  const blocked =
    locked ?? !(isAdmin || tier === "premium" || tier === "vip");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kbPad, setKbPad] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKbPad(overlap);
    };
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    sync();
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const resizeField = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  };

  const send = async (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!text || busy || blocked) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setDraft("");
    setError("");
    setBusy(true);
    requestAnimationFrame(() => {
      if (fieldRef.current) {
        fieldRef.current.style.height = "auto";
      }
    });
    try {
      const token = await getChatSessionToken();
      if (!token) {
        setError("Сессия истекла. Обновите страницу и войдите снова.");
        return;
      }
      const timeout = abortAfter(API_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch("/api/ai/songwriter-chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: history }),
          signal: timeout.signal,
        });
      } finally {
        timeout.cancel();
      }
      const payload = (await response.json().catch(() => null)) as ChatOk | null;
      if (!response.ok || !payload?.reply?.trim()) {
        setError(humanizeError(payload?.code || payload?.error, payload?.error));
        return;
      }
      setMessages([...history, { role: "assistant", content: payload.reply.trim() }]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setError("Ответ занял слишком много времени. Попробуйте ещё раз.");
        return;
      }
      setError("Не удалось связаться с продюсером. Проверьте интернет и повторите.");
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-studio-surface p-5 ring-1 ring-studio-border sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-studio-bg/50 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
            <Lock className="h-7 w-7 text-amber-300" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold">
            Нейросоздание песен
          </h2>
          <p className="mt-2 max-w-sm text-sm text-studio-muted">
            Твой личный ИИ-продюсер доступен в Premium.
          </p>
          <Link href="/dashboard/student/subscription" className="mt-6 w-full max-w-xs">
            <Button fullWidth size="lg">
              <Sparkles className="h-5 w-5" />
              Обновить тариф
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  const empty = messages.length === 0;

  return (
    <section
      className="relative flex min-h-[32rem] flex-col overflow-hidden rounded-3xl bg-studio-card ring-1 ring-studio-accent/20 sm:min-h-[36rem]"
      style={{ paddingBottom: kbPad }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-fuchsia-500/20 blur-3xl"
        aria-hidden
      />
      <header className="relative flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
          <PenLine className="h-5 w-5 text-fuchsia-200" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Нейросоздание песен</h2>
          <p className="mt-1 text-sm text-studio-muted">
            Тексты, рифмы, структура и вокальные подсказки от ИИ-продюсера.
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgba(192,132,252,0.35)_transparent] [scrollbar-width:thin] sm:px-5">
        {empty && (
          <p className="px-2 py-6 text-center text-sm text-studio-muted">
            Опишите тему, настроение или строку — начнём писать песню.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}-${item.content.slice(0, 16)}`}
              className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%] ${
                  item.role === "user"
                    ? "rounded-br-md bg-violet-600 text-white"
                    : "rounded-bl-md bg-studio-surface text-studio-text ring-1 ring-studio-border"
                }`}
              >
                {item.role === "assistant" ? (
                  <MarkdownText text={item.content} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.content}</p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-studio-surface px-4 py-3 ring-1 ring-studio-border">
                <p className="mb-1 text-[11px] text-studio-muted">Продюсер печатает...</p>
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-300 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-300 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fuchsia-300" />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="relative border-t border-studio-border/80 bg-studio-card/95 px-3 pb-3 pt-3 sm:px-5">
        {error && <p className="mb-2 text-sm text-amber-200">{error}</p>}
        {empty && (
          <div className="mb-3 flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void send(chip)}
                className="rounded-full bg-studio-surface px-3 py-1.5 text-xs text-fuchsia-100 ring-1 ring-fuchsia-400/30 transition hover:bg-fuchsia-500/15 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={fieldRef}
            value={draft}
            rows={1}
            maxLength={4000}
            disabled={busy}
            placeholder="Напишите тему, строку или вопрос по вокалу..."
            onChange={(event) => {
              setDraft(event.target.value);
              resizeField();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border placeholder:text-studio-muted/70 focus:outline-none focus:ring-studio-accent"
          />
          <button
            type="button"
            disabled={busy || draft.trim().length === 0}
            onClick={() => void send()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(192,132,252,0.4)] transition hover:shadow-[0_0_36px_rgba(232,121,249,0.55)] disabled:opacity-50"
            aria-label="Отправить"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
