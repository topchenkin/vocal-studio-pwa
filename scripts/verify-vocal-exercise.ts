import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { teacherReaction } from "../lib/vocal-exercise";
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

console.log("vocal exercise UI, progress, notifications, accept, TLS: ok");
