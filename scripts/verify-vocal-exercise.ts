import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { teacherReaction } from "../lib/vocal-exercise";

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

console.log("vocal exercise UI boundaries and queue security: ok");
