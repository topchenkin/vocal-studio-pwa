"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.documentElement.setAttribute("data-uvs-modal", "1");
    } else {
      document.body.style.overflow = "";
      document.documentElement.removeAttribute("data-uvs-modal");
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.removeAttribute("data-uvs-modal");
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-x-0 z-[90] flex items-start justify-center overflow-hidden px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:pt-4"
          style={{
            top: "var(--uvs-vv-top, 0px)",
            height: "var(--uvs-vv-height, 100dvh)",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`relative w-full ${sizes[size]} max-h-[calc(var(--uvs-vv-height,100dvh)-1.5rem)] overflow-y-auto rounded-2xl bg-studio-card ring-1 ring-studio-border shadow-card`}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-studio-border px-5 py-4">
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-studio-muted transition-colors hover:bg-studio-surface hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
