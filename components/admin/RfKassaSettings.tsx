"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { fetchRfKassa, setRfKassa } from "@/lib/payment-client";
import { paymentProviderLabel, type RfKassa } from "@/lib/payment-config";

export default function RfKassaSettings() {
  const [provider, setProvider] = useState<RfKassa>("robokassa");
  const [robokassaReady, setRobokassaReady] = useState(false);
  const [yookassaReady, setYookassaReady] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRfKassa();
      setProvider(data.provider);
      setRobokassaReady(data.robokassaReady);
      setYookassaReady(data.yookassaReady);
      setResultUrl(data.resultUrl || "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось прочитать кассу"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: RfKassa) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await setRfKassa(next);
      setProvider(data.provider);
      setRobokassaReady(data.robokassaReady);
      setYookassaReady(data.yookassaReady);
      setMessage(
        `Касса РФ: ${paymentProviderLabel(data.provider)}. Ученики увидят её сразу, без обновления приложения.`
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось переключить кассу"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-studio-surface p-5 ring-1 ring-studio-border">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-studio-accent/15 p-2.5 text-studio-accent-light">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-studio-text">
            Касса для оплаты из РФ
          </h2>
          <p className="mt-1 text-sm text-studio-muted">
            Кнопка «СБП или картой РФ» идёт через выбранную кассу. Международные
            карты по-прежнему через Prodamus. ЮKassa остаётся запасным вариантом.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={saving || !robokassaReady}
            onClick={() => void save("robokassa")}
            className={`min-h-12 rounded-xl px-4 py-3 text-left text-sm font-medium ring-1 ${
              provider === "robokassa"
                ? "bg-studio-accent text-white ring-studio-accent"
                : "bg-studio-bg/60 text-studio-text ring-studio-border"
            } disabled:opacity-50`}
          >
            Robokassa
            <span className="mt-1 block text-xs font-normal opacity-80">
              {robokassaReady ? "СБП, МИР, карты РФ" : "Ключи магазина не заданы"}
            </span>
          </button>
          <button
            type="button"
            disabled={saving || !yookassaReady}
            onClick={() => void save("yookassa")}
            className={`min-h-12 rounded-xl px-4 py-3 text-left text-sm font-medium ring-1 ${
              provider === "yookassa"
                ? "bg-studio-accent text-white ring-studio-accent"
                : "bg-studio-bg/60 text-studio-text ring-studio-border"
            } disabled:opacity-50`}
          >
            ЮKassa
            <span className="mt-1 block text-xs font-normal opacity-80">
              {yookassaReady ? "Запасной вариант" : "Ключи магазина не заданы"}
            </span>
          </button>
        </div>
      )}

      {resultUrl ? (
        <p className="mt-4 text-xs leading-5 text-studio-muted">
          В личном кабинете Robokassa укажите Result URL{" "}
          <span className="break-all text-studio-text">{resultUrl}</span>
          , Success URL https://www.uniquevocal.ru/pay/success, Fail URL
          https://www.uniquevocal.ru/pay/fail, метод GET. Алгоритм подписи должен
          совпадать с ROBOKASSA_HASH (обычно MD5).
        </p>
      ) : null}

      {(error || message) && (
        <p
          className={`mt-4 text-sm ${
            error ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {error ?? message}
        </p>
      )}
    </section>
  );
}
