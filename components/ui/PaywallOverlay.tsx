"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import Link from "next/link";
import Button from "./Button";

interface PaywallOverlayProps {
  title?: string;
  description?: string;
  onUpgrade?: () => void;
  href?: string;
  buttonLabel?: string;
}

export default function PaywallOverlay({
  title = "Доступно по подписке",
  description = "Оформите Standard или выше, чтобы открыть этот раздел",
  onUpgrade,
  href = "/dashboard/student/subscription",
  buttonLabel = "Купить премиум",
}: PaywallOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-studio-bg/85 backdrop-blur-md"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-accent/10 ring-1 ring-studio-accent/30">
        <Lock className="h-7 w-7 text-studio-accent" />
      </div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 max-w-xs text-center text-sm text-studio-muted">
        {description}
      </p>
      {onUpgrade ? (
        <Button className="mt-5 min-h-11" onClick={onUpgrade}>
          {buttonLabel}
        </Button>
      ) : (
        <Link href={href} className="mt-5">
          <Button className="min-h-11">{buttonLabel}</Button>
        </Link>
      )}
    </motion.div>
  );
}
