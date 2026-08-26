import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXERCISE_ATTEMPT_MAX_SEC,
  EXERCISE_PHRASE_MAX_SEC,
  nextPhraseSortOrder,
  phrasesForExercise,
  sanitizeAttemptFeedback,
  teacherReaction,
} from "../lib/vocal-exercise";
import {
  AUDIO_FILE_ACCEPT,
  isAllowedAudioFile,
  isAllowedVideoFile,
  mediaAcceptFor,
} from "../lib/file-accept";
import {
  bestScoreMap,
  countPassedPhrases,
  phraseProgressPercent,
  progressLabel,
} from "../lib/exercise-progress";
import {
  exerciseResultChatText,
  exerciseResultNotificationText,
  isExerciseResultText,
  isExerciseVoiceFollowup,
} from "../lib/exercise-result-payload";
import { resolveNotificationHref } from "../lib/notification-href";

assert.equal(teacherReaction(80, "intonation").mood, "joyful");
assert.equal(teacherReaction(100, "rhythm").avatar, "/teacher-score-high.webp");
assert.equal(teacherReaction(79, "rhythm").mood, "satisfied");
assert.equal(teacherReaction(50, "completeness").avatar, "/teacher-score-medium.webp");
assert.equal(teacherReaction(49, "intonation").mood, "supportive");
assert.equal(teacherReaction(0, "rhythm").avatar, "/teacher-score-low.webp");
assert.equal(sanitizeAttemptFeedback("??????????????????????"), "Не удалось распознать");
assert.equal(sanitizeAttemptFeedback("Не удалось распознать вокальную мелодию."), "Не удалось распознать вокальную мелодию.");
assert.equal(sanitizeAttemptFeedback(null), "Не удалось распознать");

const migration = readFileSync(
  path.join(process.cwd(), "supabase-migrations", "2026-08-25-vocal-exercise-scoring.sql"),
  "utf8"
);
for (const expected of [
  "unique references public.exercises",
  "for update skip locked",
  "auth.role() <> 'service_role'",
  "student_id = auth.uid()",
  "public.user_can_access_exercise",
  "expires_at timestamptz not null default (now() + interval '1 hour')",
]) {
  assert.ok(migration.includes(expected), `migration is missing: ${expected}`);
}

const progressSql = readFileSync(
  path.join(process.cwd(), "supabase-migrations", "2026-08-25-exercise-progress-and-report.sql"),
  "utf8"
);
for (const expected of [
  "vocal_phrase_progress",
  "Результаты упражнения",
  "UVS_EXERCISE_VOICE",
  "&message=",
]) {
  assert.ok(progressSql.includes(expected), `progress migration is missing: ${expected}`);
}

assert.equal(phraseProgressPercent(4, 2), 50);
assert.equal(phraseProgressPercent(4, 4), 100);
assert.equal(phraseProgressPercent(0, 0), 0);
assert.equal(phraseProgressPercent(3, 1), 33);
assert.equal(
  countPassedPhrases(["a", "b", "c", "d"], { a: 81, b: 80, c: 90, d: 12 }),
  2
);
assert.equal(progressLabel(50), "Выполнено 50%");
assert.deepEqual(
  bestScoreMap([
    { phrase_id: "a", best_score: 88 },
    { phrase_id: "b", best_score: null },
  ]),
  { a: 88, b: 0 }
);

assert.equal(exerciseResultNotificationText("Анна"), "Анна, Результаты упражнения");
assert.ok(
  isExerciseResultText(
    exerciseResultChatText("Анна", {
      v: 2,
      kind: "exercise_result",
      overall: 91,
      intonation: 90,
      rhythm: 88,
      completeness: 95,
      exerciseTitle: "Распевка",
      phraseTitle: "Фраза 1",
      shift: 0,
    })
  )
);
assert.ok(isExerciseVoiceFollowup("UVS_EXERCISE_VOICE Распевка · Фраза 1"));
assert.equal(
  resolveNotificationHref({
    actionUrl: "/dashboard/admin?tab=chat&student=11111111-1111-4111-8111-111111111111&message=22222222-2222-4222-8222-222222222222",
    kind: "chat",
    message: "Анна, Результаты упражнения",
    isAdmin: true,
  }),
  "/dashboard/admin?tab=chat&student=11111111-1111-4111-8111-111111111111&message=22222222-2222-4222-8222-222222222222"
);

assert.ok(AUDIO_FILE_ACCEPT.includes(".mp3"));
assert.ok(AUDIO_FILE_ACCEPT.includes("audio/mpeg"));
assert.ok(AUDIO_FILE_ACCEPT.includes("audio/*"));
assert.ok(mediaAcceptFor("audio").includes(".m4a"));
assert.ok(isAllowedAudioFile({ name: "lesson.mp3", type: "" }));
assert.ok(isAllowedAudioFile({ name: "from-icloud", type: "audio/mpeg" }));
assert.ok(isAllowedVideoFile({ name: "clip.mp4", type: "video/mp4" }));
assert.equal(isAllowedAudioFile({ name: "notes.pdf", type: "application/pdf" }), false);

const caddy = readFileSync(
  path.join(process.cwd(), "deploy", "sb-proxy", "Caddyfile"),
  "utf8"
);
assert.ok(caddy.includes("protocols tls1.2 tls1.2"));
assert.ok(caddy.includes("protocols h1 h2"));
assert.ok(!/^\s*protocols h1 h2 h3/m.test(caddy));

assert.equal(EXERCISE_PHRASE_MAX_SEC, 600);
assert.equal(EXERCISE_ATTEMPT_MAX_SEC, 600);
const fourPhrases = [
  { exercise_id: "ex-1", sort_order: 0 },
  { exercise_id: "ex-1", sort_order: 1 },
  { exercise_id: "ex-1", sort_order: 2 },
  { exercise_id: "ex-1", sort_order: 3 },
  { exercise_id: "ex-2", sort_order: 0 },
];
assert.equal(phrasesForExercise(fourPhrases, "ex-1").length, 4);
assert.equal(nextPhraseSortOrder(phrasesForExercise(fourPhrases, "ex-1")), 4);
assert.equal(nextPhraseSortOrder([{ sort_order: 0 }, { sort_order: 2 }]), 3);

const editor = readFileSync(
  path.join(process.cwd(), "components", "admin", "PhraseEditor.tsx"),
  "utf8"
);
const practice = readFileSync(
  path.join(process.cwd(), "components", "exercises", "VocalExercisePractice.tsx"),
  "utf8"
);
assert.ok(!editor.includes("nextEnd - nextStart > 45"));
assert.ok(editor.includes("nextPhraseSortOrder"));
assert.ok(!practice.includes("Math.min(\n        45,"));
assert.ok(practice.includes("EXERCISE_ATTEMPT_MAX_SEC"));

const uncapSql = readFileSync(
  path.join(process.cwd(), "supabase-migrations", "2026-08-25-exercise-phrases-uncap.sql"),
  "utf8"
);
for (const expected of [
  "drop constraint if exists exercise_phrases_exercise_id_sort_order_key",
  "duration_sec <= 600",
  "exercise_phrases_student_read",
]) {
  assert.ok(uncapSql.includes(expected), `uncap migration is missing: ${expected}`);
}
assert.ok(!uncapSql.includes("between 1 and 45"));

const stemsSql = readFileSync(
  path.join(process.cwd(), "supabase-migrations", "2026-08-26-vocal-stems-anchors-student-features.sql"),
  "utf8"
);
for (const expected of [
  "instrumental_storage_path",
  "vocal_clip_storage_path",
  "exercise_phrase_anchors",
  "phrase_features_student_read",
  "claim_exercise_phrase_anchor",
]) {
  assert.ok(stemsSql.includes(expected), `stems migration is missing: ${expected}`);
}

const guide = readFileSync(
  path.join(process.cwd(), "components", "exercises", "LiveMelodyGuide.tsx"),
  "utf8"
);
assert.ok(guide.includes("createYinDetector"));
assert.ok(guide.includes("HITBOX_GREEN_CENTS") || guide.includes("quantizeNoteBlocks"));
assert.ok(guide.includes("devicePixelRatio"));
assert.ok(guide.includes("ResizeObserver"));
assert.ok(guide.includes("[SYNC DEBUG]"));
assert.ok(guide.includes("currentTime"));
assert.ok(!guide.includes("estimateAutoKeyCents"));
assert.ok(!guide.includes("autoShift"));
assert.ok(practice.includes("LiveMelodyGuide"));
assert.ok(practice.includes("flex-wrap"));
assert.ok(practice.includes("w-full sm:w-auto") || practice.includes("sm:w-auto"));
assert.ok(!practice.includes("onAutoKey"));
assert.ok(!practice.includes("EXERCISE_TRANSPOSE_OPTIONS"));
assert.ok(practice.includes("sanitizeAttemptFeedback"));
const noteBlocks = readFileSync(path.join(process.cwd(), "lib", "note-blocks.ts"), "utf8");
assert.ok(noteBlocks.includes("pitchClassCents"));
assert.ok(noteBlocks.includes("if (diff > 600) diff = 1200 - diff"));
assert.ok(editor.includes("эталон вокала") || editor.includes("Эталон вокала"));

console.log("vocal exercise UI, progress, notifications, accept, TLS: ok");
