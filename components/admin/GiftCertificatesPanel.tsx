"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, Link2, Plus, Trash2, CheckCircle2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import NumberInput from "@/components/ui/NumberInput";
import GiftCertificateArt from "@/components/admin/GiftCertificateArt";
import { useAuth } from "@/context/AuthContext";
import { APP_TIER_PRICES } from "@/lib/constants";
import {
  formatGiftCode,
  GIFT_KIND_LABELS,
  GIFT_STATUS_LABELS,
  type GiftCertificate,
  type GiftKind,
} from "@/lib/gift-certificates";
import { createGiftPaymentLink } from "@/lib/payment-client";
import { supabase } from "@/lib/supabase";

const KINDS: GiftKind[] = ["lesson", "abonement", "subscription", "premium"];

function statusVariant(status: GiftCertificate["status"]) {
  if (status === "paid") return "gold" as const;
  if (status === "redeemed") return "success" as const;
  if (status === "cancelled") return "muted" as const;
  return "default" as const;
}

export default function GiftCertificatesPanel() {
  const { isMockAdmin } = useAuth();
  const [items, setItems] = useState<GiftCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payUrl, setPayUrl] = useState("");
  const [copied, setCopied] = useState("");

  const [kind, setKind] = useState<GiftKind>("abonement");
  const [recipientName, setRecipientName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [note, setNote] = useState("");
  const [lessons, setLessons] = useState(8);
  const [tier, setTier] = useState<"standard" | "premium" | "vip">("premium");
  const [amount, setAmount] = useState(20000);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const suggestedAmount = useMemo(() => {
    if (kind === "subscription") return APP_TIER_PRICES[tier];
    if (kind === "premium") return 20000 + APP_TIER_PRICES[tier];
    return amount;
  }, [kind, tier, amount]);

  useEffect(() => {
    if (kind === "subscription") setAmount(APP_TIER_PRICES[tier]);
  }, [kind, tier]);

  const load = useCallback(async () => {
    if (isMockAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase
      .from("gift_certificates")
      .select("*")
      .order("created_at", { ascending: false });
    if (queryError) {
      setError("Не удалось загрузить сертификаты");
    } else {
      setItems((data ?? []) as GiftCertificate[]);
      setError("");
    }
    setLoading(false);
  }, [isMockAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const create = async () => {
    setError("");
    setBusy(true);
    setPayUrl("");
    const { data, error: rpcError } = await supabase.rpc(
      "admin_create_gift_certificate",
      {
        p_kind: kind,
        p_recipient_name: recipientName.trim(),
        p_note: note.trim(),
        p_amount_rub: amount,
        p_lessons_count:
          kind === "lesson" ? 1 : kind === "subscription" ? null : lessons,
        p_app_sub_tier:
          kind === "subscription" || kind === "premium" ? tier : null,
        p_buyer_name: buyerName.trim() || null,
      }
    );
    if (rpcError || !data) {
      setBusy(false);
      setError(rpcError?.message || "Не удалось создать сертификат");
      return;
    }
    const created = data as GiftCertificate;
    try {
      const url = await createGiftPaymentLink(created.id);
      setPayUrl(url);
      setSelectedId(created.id);
      setCreating(false);
      setRecipientName("");
      setBuyerName("");
      setNote("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message}. Сертификат создан — нажмите «Ссылка СБП» ещё раз.`
          : "Сертификат создан, ссылку не получили"
      );
      setSelectedId(created.id);
      await load();
    }
    setBusy(false);
  };

  const refreshPayLink = async (id: string) => {
    setError("");
    setBusy(true);
    try {
      const url = await createGiftPaymentLink(id);
      setPayUrl(url);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Нет ссылки СБП");
    }
    setBusy(false);
  };

  const markPaid = async (id: string) => {
    setError("");
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_mark_gift_certificate_paid",
      { p_id: id }
    );
    if (rpcError || !data) {
      setError(rpcError?.message || "Не удалось отметить оплату");
    } else {
      await load();
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (
      !window.confirm(
        "Удалить сертификат безвозвратно? Код перестанет работать."
      )
    ) {
      return;
    }
    setError("");
    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "admin_delete_gift_certificate",
      { p_id: id }
    );
    if (rpcError) {
      setError(rpcError.message || "Не удалось удалить");
    } else {
      if (selectedId === id) setSelectedId(null);
      setPayUrl("");
      await load();
    }
    setBusy(false);
  };

  if (isMockAdmin) {
    return (
      <p className="rounded-2xl bg-studio-card p-5 text-sm text-studio-muted ring-1 ring-studio-border">
        Сертификаты доступны после входа администратором, не в демо-режиме.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Сертификаты</h3>
          <p className="mt-1 text-xs text-studio-muted">
            Звонок → создаёте сертификат → кидаете ссылку оплаты ЮKassa.
            Код дарите после оплаты. Активация по имени получателя.
          </p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          <Plus className="h-4 w-4" />
          Новый сертификат
        </Button>
      </div>

      {creating && (
        <div className="space-y-4 rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={`rounded-xl px-3 py-2.5 text-left text-xs ring-1 transition ${
                  kind === item
                    ? "bg-studio-accent/15 text-studio-accent-light ring-studio-accent"
                    : "bg-studio-surface text-studio-muted ring-studio-border"
                }`}
              >
                {GIFT_KIND_LABELS[item]}
              </button>
            ))}
          </div>

          {(kind === "abonement" || kind === "premium") && (
            <NumberInput
              label="Количество занятий"
              value={lessons}
              onChange={setLessons}
            />
          )}
          {(kind === "subscription" || kind === "premium") && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-muted">
                Тариф подписки
              </span>
              <select
                value={tier}
                onChange={(event) =>
                  setTier(event.target.value as "standard" | "premium" | "vip")
                }
                className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              >
                <option value="standard">Standard · {APP_TIER_PRICES.standard} ₽</option>
                <option value="premium">Premium · {APP_TIER_PRICES.premium} ₽</option>
                <option value="vip">VIP · {APP_TIER_PRICES.vip} ₽</option>
              </select>
            </label>
          )}

          <NumberInput
            label="Сумма к оплате, ₽"
            value={amount}
            onChange={setAmount}
          />
          {kind !== "lesson" && kind !== "abonement" && (
            <p className="text-[11px] text-studio-muted">
              Подсказка по каталогу: {suggestedAmount.toLocaleString("ru-RU")} ₽
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Имя получателя — как введёт при регистрации
            </span>
            <input
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              placeholder="Анна Волкова"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Кто покупает (необязательно)
            </span>
            <input
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              placeholder="Мама Анны, Игорь…"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-studio-muted">
              Заметка себе — всплывёт при одобрении учетки
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border"
              placeholder="Папа Анны, звонок 22.08, абонемент на день рождения"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button onClick={() => void create()} disabled={busy} fullWidth>
            {busy ? "Создаём и берём ссылку СБП…" : "Создать и получить ссылку СБП"}
          </Button>
        </div>
      )}

      {error && !creating && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-studio-muted">Загружаем…</p>
      ) : items.length === 0 && !creating ? (
        <div className="rounded-3xl bg-studio-card p-8 text-center ring-1 ring-studio-border">
          <Gift className="mx-auto h-8 w-8 text-studio-gold" />
          <p className="mt-3 text-sm text-studio-muted">
            Пока нет сертификатов. Создайте первый по звонку.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setPayUrl("");
                }}
                className={`w-full rounded-2xl px-4 py-3 text-left ring-1 transition ${
                  selected?.id === item.id
                    ? "bg-studio-accent/10 ring-studio-accent/50"
                    : "bg-studio-surface ring-studio-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.recipient_name}</p>
                    <p className="text-xs text-studio-muted">
                      {GIFT_KIND_LABELS[item.kind]} ·{" "}
                      {Number(item.amount_rub).toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                  <Badge variant={statusVariant(item.status)}>
                    {GIFT_STATUS_LABELS[item.status]}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-xs tracking-wider text-studio-gold">
                  {formatGiftCode(item.code)}
                </p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-4">
              <GiftCertificateArt cert={selected} />
              {selected.note && (
                <div className="rounded-2xl bg-studio-gold/10 p-4 text-sm ring-1 ring-studio-gold/30">
                  <p className="text-xs uppercase tracking-wider text-studio-gold">
                    Заметка
                  </p>
                  <p className="mt-1">{selected.note}</p>
                  {selected.buyer_name && (
                    <p className="mt-2 text-xs text-studio-muted">
                      Покупатель: {selected.buyer_name}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void copy("code", formatGiftCode(selected.code))
                  }
                >
                  <Copy className="h-4 w-4" />
                  {copied === "code" ? "Скопировано" : "Код"}
                </Button>
                {selected.status === "pending_payment" && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void refreshPayLink(selected.id)}
                    >
                      <Link2 className="h-4 w-4" />
                      Ссылка СБП
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void markPaid(selected.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Оплачен (перевод)
                    </Button>
                  </>
                )}
                {payUrl && (
                  <Button onClick={() => void copy("url", payUrl)}>
                    {copied === "url" ? "Ссылка скопирована" : "Копировать оплату"}
                  </Button>
                )}
                {selected.status !== "redeemed" && !selected.redeemed_by && (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => void remove(selected.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </Button>
                )}
              </div>
              {payUrl && (
                <p className="break-all rounded-xl bg-studio-surface p-3 text-[11px] text-studio-muted ring-1 ring-studio-border">
                  {payUrl}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
