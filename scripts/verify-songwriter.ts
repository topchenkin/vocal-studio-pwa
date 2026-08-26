import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fn = readFileSync(
  path.join(root, "supabase", "functions", "songwriter-chat", "index.ts"),
  "utf8"
);
assert.ok(fn.includes("api.groq.com/openai/v1/chat/completions"));
assert.ok(fn.includes("GROQ_API_KEY"));
assert.ok(fn.includes("llama3-8b-8192"));
assert.ok(fn.includes("Ты профессиональный музыкальный продюсер и автор хитов"));
assert.ok(fn.includes("Access-Control-Allow-Origin"));
assert.ok(fn.includes("premium_required"));
assert.ok(fn.includes("{ reply:"));
assert.ok(fn.includes("huggingface-projects-llama-3-2-3b-instruct.hf.space"));
assert.ok(fn.includes("completeViaSpace"));
assert.ok(!fn.includes("role: rec.role === \"system\""));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "songwriter", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("SongwriterChat"));

const ui = readFileSync(
  path.join(root, "components", "ai", "SongwriterChat.tsx"),
  "utf8"
);
assert.ok(ui.includes("songwriter-chat"));
assert.ok(ui.includes("functions.invoke"));
assert.ok(ui.includes("Написать хит про осень"));
assert.ok(ui.includes("Помоги с рифмой к слову..."));
assert.ok(ui.includes("Как структурировать песню?"));
assert.ok(ui.includes("Продюсер печатает"));
assert.ok(ui.includes("Твой личный ИИ-продюсер доступен в Premium"));
assert.ok(ui.includes("Обновить тариф"));
assert.ok(ui.includes("visualViewport"));
assert.ok(ui.includes("scrollIntoView"));
assert.ok(ui.includes("MarkdownText"));
assert.ok(ui.includes("font-semibold"));

const tools = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-tools", "page.tsx"),
  "utf8"
);
assert.ok(tools.includes('id: "songwriter"'));
assert.ok(tools.includes("Нейросоздание песен"));
assert.ok(tools.includes("lg:grid-cols-7"));
assert.ok(tools.includes('locked={locked("songwriter")}'));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"songwriter"'));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-ai-songwriter-tool.sql"),
  "utf8"
);
assert.ok(sql.includes("'songwriter'"));

console.log("songwriter chat + 7th нейросети tab: ok");
