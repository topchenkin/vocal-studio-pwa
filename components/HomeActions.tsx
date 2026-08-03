"use client";

import { ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";

interface HomeActionsProps {
  onPay: () => void;
  onBook: () => void;
}

export default function HomeActions({ onPay, onBook }: HomeActionsProps) {
  return (
    <div className="space-y-3">
      <Button fullWidth size="lg" onClick={onPay}>
        Оплатить абонемент
        <ArrowRight className="h-5 w-5" />
      </Button>

      <Button fullWidth size="lg" variant="secondary" onClick={onBook}>
        Записаться на урок
      </Button>

      <p className="text-center text-xs text-studio-muted">
        Первое пробное занятие — бесплатно
      </p>
    </div>
  );
}
