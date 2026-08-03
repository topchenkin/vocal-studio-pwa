"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Play, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ExerciseAudioPlayer from "@/components/exercises/ExerciseAudioPlayer";
import SbpPaymentSheet, {
  type PaymentPurpose,
} from "@/components/payment/SbpPaymentSheet";
import type { AppSubscriptionTier, Exercise } from "@/types";

const tierRank: Record<AppSubscriptionTier, number> = {
  none: 0,
  standard: 1,
  premium: 2,
  vip: 3,
};

const tierLabel: Record<AppSubscriptionTier, string> = {
  none: "Free",
  standard: "Standard",
  premium: "Premium",
  vip: "VIP",
};

const demoExercises: Exercise[] = [
  {
    id: "demo-breath",
    title: "Опора дыхания",
    description: "Ровный контролируемый выдох и включение диафрагмы.",
    media_url: "",
    type: "audio",
    min_tier_required: "none",
    min_cat_level: "beginner",
    active_students_only: false,
    audience_mode: "rules",
    is_published: true,
    storage_path: null,
    created_at: new Date(0).toISOString(),
    created_by: null,
  },
  {
    id: "demo-warmup",
    title: "Распевка на резонаторы",
    description: "Мягкий разогрев перед занятием или выступлением.",
    media_url: "",
    type: "audio",
    min_tier_required: "none",
    min_cat_level: "beginner",
    active_students_only: false,
    audience_mode: "rules",
    is_published: true,
    storage_path: null,
    created_at: new Date(0).toISOString(),
    created_by: null,
  },
  {
    id: "demo-registers",
    title: "Грудной и головной регистры",
    description: "Видео-разбор безопасного переключения регистров.",
    media_url: "",
    type: "video",
    min_tier_required: "premium",
    min_cat_level: "beginner",
    active_students_only: false,
    audience_mode: "rules",
    is_published: true,
    storage_path: null,
    created_at: new Date(0).toISOString(),
    created_by: null,
  },
  {
    id: "demo-stage",
    title: "Сценическая подача",
    description: "Продвинутая практика уверенного выступления.",
    media_url: "",
    type: "video",
    min_tier_required: "vip",
    min_cat_level: "pro",
    active_students_only: true,
    audience_mode: "rules",
    is_published: true,
    storage_path: null,
    created_at: new Date(0).toISOString(),
    created_by: null,
  },
];

export default function ExerciseLibrary() {
  const { tier } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockedTier, setLockedTier] = useState<AppSubscriptionTier | null>(null);
  const [payment, setPayment] = useState<PaymentPurpose | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadExercises = async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("title");

      if (!mounted) return;
      if (error) console.error("Unable to load exercises:", error.message);
      const resolvedExercises = await Promise.all(
        (data ?? []).map(async (exercise) => {
          if (!exercise.storage_path) return exercise;
          const { data: signed } = await supabase.storage
            .from("exercise-media")
            .createSignedUrl(exercise.storage_path, 60 * 60);
          return {
            ...exercise,
            media_url: signed?.signedUrl ?? "",
          };
        })
      );
      if (!mounted) return;
      setExercises(
        resolvedExercises.length > 0
          ? resolvedExercises
          : process.env.NODE_ENV === "development"
            ? demoExercises
            : []
      );
      setLoading(false);
    };

    void loadExercises();
    return () => {
      mounted = false;
    };
  }, []);

  const audioExercises = useMemo(
    () => exercises.filter((exercise) => exercise.type === "audio"),
    [exercises]
  );
  const videoExercises = useMemo(
    () => exercises.filter((exercise) => exercise.type === "video"),
    [exercises]
  );

  const upgrade = () => {
    const target =
      lockedTier === "vip" ? ("vip" as const) : ("premium" as const);
    setLockedTier(null);
    setPayment({
      type: "subscription",
      tier: target,
      amount: target === "vip" ? 3990 : 1990,
    });
  };

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-56 animate-pulse rounded-2xl bg-studio-surface ring-1 ring-studio-border"
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold">
            Аудио-распевки
          </h2>
          <p className="text-sm text-studio-muted">
            Доступны всем ученикам. Настройте комфортную скорость.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {audioExercises.map((exercise) => (
            <div key={exercise.id}>
              <div className="mb-2">
                <h3 className="font-medium">{exercise.title}</h3>
                <p className="text-xs text-studio-muted">
                  {exercise.description}
                </p>
              </div>
              <ExerciseAudioPlayer
                src={exercise.media_url}
                title={exercise.title}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold">Видео-уроки</h2>
          <p className="text-sm text-studio-muted">
            Экспертные разборы для подписок Premium и VIP.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {videoExercises.map((exercise) => {
            // Rows already passed server RLS (user_can_access_exercise).
            // Client lock only for local demo fallbacks in development.
            const isDemo = exercise.id.startsWith("demo-");
            const locked =
              isDemo &&
              tierRank[tier] < tierRank[exercise.min_tier_required];

            return (
              <article
                key={exercise.id}
                className="relative overflow-hidden rounded-2xl bg-studio-surface ring-1 ring-studio-border"
              >
                <button
                  type="button"
                  onClick={() =>
                    locked && setLockedTier(exercise.min_tier_required)
                  }
                  className="block w-full text-left"
                >
                  <div
                    className={`relative flex aspect-video items-center justify-center bg-gradient-to-br from-studio-card to-studio-bg ${
                      locked ? "blur-[3px]" : ""
                    }`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-studio-accent/15 ring-1 ring-studio-accent/30">
                      {exercise.media_url ? (
                        <Play className="h-6 w-6 translate-x-0.5 text-studio-accent-light" />
                      ) : (
                        <Video className="h-6 w-6 text-studio-accent-light" />
                      )}
                    </div>
                  </div>
                  <div className={`p-4 ${locked ? "select-none blur-[2px]" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium">{exercise.title}</h3>
                      <Badge variant="muted">
                        {tierLabel[exercise.min_tier_required]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-studio-muted">
                      {exercise.description}
                    </p>
                  </div>
                  {locked && (
                    <span className="absolute inset-0 flex flex-col items-center justify-center bg-studio-bg/45 backdrop-blur-[1px]">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-studio-card ring-1 ring-studio-accent/35 shadow-glow">
                        <Lock className="h-5 w-5 text-studio-accent" />
                      </span>
                      <span className="mt-3 text-sm font-medium">
                        Доступно с {tierLabel[exercise.min_tier_required]}
                      </span>
                    </span>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <Modal
        open={Boolean(lockedTier)}
        onClose={() => setLockedTier(null)}
        title="Премиум-упражнение"
      >
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-studio-accent/10">
            <Lock className="h-6 w-6 text-studio-accent" />
          </div>
          <h3 className="mt-4 font-display text-2xl font-semibold">
            Доступно с {lockedTier ? tierLabel[lockedTier] : "Premium"} подпиской
          </h3>
          <p className="mt-2 text-sm text-studio-muted">
            Обновите тариф, чтобы смотреть урок без ограничений.
          </p>
          <Button fullWidth className="mt-6" onClick={upgrade}>
            Обновить тариф
          </Button>
        </div>
      </Modal>

      {payment && (
        <SbpPaymentSheet
          open
          purpose={payment}
          onClose={() => setPayment(null)}
        />
      )}
    </>
  );
}
