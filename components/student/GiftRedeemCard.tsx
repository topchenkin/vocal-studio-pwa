"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  formatGiftCode,
  GIFT_KIND_LABELS,
  normalizeGiftCode,
  type GiftKind,
} from "@/lib/gift-certificates";
import { supabase } from "@/lib/supabase";

const PENDING_GIFT_KEY = "uvs_pending_gift_code";

export default function GiftRedeemCard() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!profile || profile.gift_certificate_id) return;
    let pending = "";
    try {
      pending = sessionStorage.getItem(PENDING_GIFT_KEY) || "";
    } catch {
      pending = "";
    }
    if (!pending) return;
    setCode(formatGiftCode(pending));
    void (async () => {
      setBusy(true);
      const { error: redeemError } = await supabase.rpc(
        "redeem_gift_certificate",
        { p_code: normalizeGiftCode(pending) }
      );
      setBusy(false);
      try {
        sessionStorage.removeItem(PENDING_GIFT_KEY);
      } catch {
        /* ignore */
      }
      if (redeemError) {
        setError(redeemError.message);
        return;
      }
      setOk("Подарочный сертификат активирован");
      await refreshProfile();
    })();
  }, [profile, refreshProfile]);

  if (!profile) return null;

  if (profile.gift_certificate_id) {
    const kind = (profile.gift_kind || "") as GiftKind;
    return (
      <div className="rounded-3xl bg-studio-gold/10 p-5 ring-1 ring-studio-gold/35">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-studio-gold" />
          <div>
            <p className="font-medium text-studio-gold">Подарочный сертификат</p>
            <p className="mt-1 text-sm text-studio-text">
              {GIFT_KIND_LABELS[kind] || "Активирован"}
              {profile.gift_buyer_name
                ? ` · от ${profile.gift_buyer_name}`
                : ""}
            </p>
            {profile.gift_note && (
              <p className="mt-2 text-xs text-studio-muted">{profile.gift_note}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-studio-card p-5 ring-1 ring-studio-border">
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-studio-gold" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Есть подарочный код?</p>
          <p className="mt-1 text-xs text-studio-muted">
            Имя в профиле должно совпасть с именем на сертификате.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(event) =>
                setCode(formatGiftCode(event.target.value).slice(0, 14))
              }
              className="min-w-0 flex-1 rounded-xl bg-studio-surface px-4 py-3 font-mono text-sm tracking-wider ring-1 ring-studio-border"
              placeholder="XXXX-XXXX-XXXX"
            />
            <Button
              disabled={busy}
              onClick={async () => {
                setError("");
                setOk("");
                setBusy(true);
                const { error: redeemError } = await supabase.rpc(
                  "redeem_gift_certificate",
                  { p_code: normalizeGiftCode(code) }
                );
                setBusy(false);
                if (redeemError) {
                  setError(redeemError.message);
                  return;
                }
                setOk("Сертификат активирован");
                setCode("");
                await refreshProfile();
              }}
            >
              {busy ? "…" : "Активировать"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          {ok && <p className="mt-2 text-sm text-emerald-400">{ok}</p>}
        </div>
      </div>
    </div>
  );
}
