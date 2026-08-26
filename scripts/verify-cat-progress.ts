import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-cat-xp.sql"),
  "utf8"
);
assert.ok(sql.includes("award_cat_xp"));
assert.ok(
  readFileSync(
    path.join(root, "supabase-migrations", "2026-08-26-cat-xp-lessons.sql"),
    "utf8"
  ).includes("grant_due_lesson_cat_xp")
);
assert.ok(
  readFileSync(
    path.join(root, "supabase-migrations", "2026-08-26-cat-xp-lessons.sql"),
    "utf8"
  ).includes("'lesson'")
);
assert.ok(
  readFileSync(
    path.join(root, "components", "student", "VocalProgressSection.tsx"),
    "utf8"
  ).includes("groupKey")
);
assert.ok(sql.includes("review_vocal_test"));
assert.ok(sql.includes("cat_exam_ready"));
assert.ok(sql.includes("when 'beginner' then 48"));
assert.ok(sql.includes("when 'basic' then 280"));
assert.ok(sql.includes("when 'pro' then 1100"));

const nav = readFileSync(
  path.join(root, "components", "student", "StudentNav.tsx"),
  "utf8"
);
assert.ok(nav.includes("/dashboard/student/pro-test"));
assert.ok(nav.includes("Проф. тест"));

const home = readFileSync(
  path.join(root, "app", "dashboard", "student", "StudentDashboardClient.tsx"),
  "utf8"
);
assert.ok(!home.includes("VocalProgressSection"));
assert.ok(
  readFileSync(
    path.join(root, "components", "student", "SubscriptionStatus.tsx"),
    "utf8"
  ).includes("Готов перейти на следующий уровень")
);

const analyzer = readFileSync(
  path.join(root, "components", "ai", "PitchAnalyzer.tsx"),
  "utf8"
);
assert.ok(analyzer.includes('variant === "exam"'));
assert.ok(analyzer.includes('awardCatXp("analyzer")'));

console.log("cat progress: ok");
