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

const progressSql = readFileSync(
  path.join(root, "supabase-migrations", "2026-09-07-student-cabinet-progress.sql"),
  "utf8"
);
assert.ok(progressSql.includes("student_cabinet_progress"));
assert.ok(progressSql.includes("log_practice_seconds"));
assert.ok(progressSql.includes("'practice'"));
assert.ok(progressSql.includes("'mixer'"));
assert.ok(progressSql.includes("'chat'"));
assert.ok(progressSql.includes("12 - public.cat_today_activity_xp"));
assert.ok(progressSql.includes("streak3-"));

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
assert.ok(home.includes("StudentHomeHub"));
assert.ok(
  readFileSync(
    path.join(root, "components", "student", "SubscriptionStatus.tsx"),
    "utf8"
  ).includes("Подписка на приложение")
);

const toast = readFileSync(
  path.join(root, "components", "xp", "XpToastStack.tsx"),
  "utf8"
);
assert.ok(toast.includes("text-studio-gold"));
assert.ok(toast.includes("+{item.amount} XP"));
assert.ok(toast.includes("/stickers/sticker-cat-star.png"));
assert.ok(toast.includes("bg-transparent"));

const hub = readFileSync(
  path.join(root, "components", "student", "StudentHomeHub.tsx"),
  "utf8"
);
assert.ok(hub.includes("TILE_CAT"));
assert.ok(hub.includes("bg-transparent object-contain"));

const chatWindow = readFileSync(
  path.join(root, "components", "chat", "ChatWindow.tsx"),
  "utf8"
);
assert.ok(chatWindow.includes("clipPath: \"circle(50%)\""));
assert.ok(chatWindow.includes("rounded-full bg-black object-cover"));
assert.ok(chatWindow.includes("aspect-square"));
assert.ok(chatWindow.includes("ChatCircleVideo"));
assert.ok(!chatWindow.includes("aspect-[4/3]"));
assert.ok(!chatWindow.includes("CircleVideoFrame"));

for (const name of [
  "sticker-cat-sing.png",
  "sticker-cat-headphones.png",
  "sticker-cat-heart.png",
  "sticker-cat-fire.png",
  "sticker-cat-star.png",
  "sticker-cat-ok.png",
  "sticker-cat-think.png",
  "sticker-cat-wave.png",
]) {
  const png = readFileSync(path.join(root, "public", "stickers", name));
  assert.equal(png[25], 6, `${name} must be RGBA`);
}

const analyzer = readFileSync(
  path.join(root, "components", "ai", "PitchAnalyzer.tsx"),
  "utf8"
);
assert.ok(analyzer.includes('variant === "exam"'));
assert.ok(analyzer.includes('awardCatXp("analyzer")'));
assert.ok(analyzer.includes("usePracticeHeartbeat"));

console.log("cat progress: ok");
