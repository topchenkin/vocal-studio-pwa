"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";

export default function Toast({
  open,
  message,
  onClose,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          className="fixed bottom-5 left-4 right-4 z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-studio-card p-4 text-sm ring-1 ring-emerald-500/30 shadow-card sm:left-auto sm:right-5"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-studio-muted hover:text-white"
            aria-label="Закрыть уведомление"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
