"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export default function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-studio-card px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 ring-1 ring-studio-border shadow-card sm:mb-5 sm:rounded-[2rem]"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-studio-border" />
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-white"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
