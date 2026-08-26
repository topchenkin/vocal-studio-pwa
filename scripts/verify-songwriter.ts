import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const api = readFileSync(path.join(root, "deploy", "ai-api", "server.mjs"), "utf8");
assert.ok(api.includes("/api/ai/songwriter-chat"));
assert.ok(api.includes("https://api.groq.com/openai/v1/chat/completions"));
assert.ok(api.includes("llama-3.1-8b-instant"));
assert.ok(api.includes("GROQ_API_KEY"));
assert.ok(api.includes("Ты профессиональный музыкальный продюсер и автор хитов"));
assert.ok(api.includes("Пиши только по-русски"));
assert.ok(api.includes("{ reply"));
assert.ok(!api.includes("/api/ai/generate-music"));
assert.ok(!api.includes("sanchit-gandhi/musicgen-streaming"));
assert.ok(!api.includes("huggingface-projects-llama-3-2-3b-instruct.hf.space"));

const page = readFileSync(
  path.join(root, "app", "dashboard", "student", "songwriter", "page.tsx"),
  "utf8"
);
assert.ok(page.includes("SongwriterChat"));

const ui = readFileSync(
  path.join(root, "components", "ai", "SongwriterChat.tsx"),
  "utf8"
);
assert.ok(ui.includes("/api/ai/songwriter-chat"));
assert.ok(ui.includes("getChatSessionToken"));
assert.ok(!ui.includes("functions.invoke"));
assert.ok(ui.includes("Написать хит про осень"));
assert.ok(ui.includes("Помоги с рифмой к слову..."));
assert.ok(ui.includes("Как структурировать песню?"));
assert.ok(ui.includes("Продюсер печатает"));
assert.ok(ui.includes("Твой личный ИИ-продюсер доступен в Premium"));
assert.ok(ui.includes("Обновить тариф"));
assert.ok(ui.includes("visualViewport"));
assert.ok(ui.includes("MarkdownText"));
assert.ok(ui.includes("font-semibold"));

const tools = readFileSync(
  path.join(root, "app", "dashboard", "student", "ai-tools", "page.tsx"),
  "utf8"
);
assert.ok(tools.includes('id: "songwriter"'));
assert.ok(tools.includes("Нейросоздание песен"));
assert.ok(tools.includes("lg:grid-cols-5"));
assert.ok(tools.includes('locked={locked("songwriter")}'));
assert.ok(!tools.includes("AiMusicComposer"));
assert.ok(!tools.includes('id: "musicgen"'));
assert.ok(tools.includes('item.id === "remover" && !isAdmin'));

const access = readFileSync(path.join(root, "lib", "ai-tools-access.ts"), "utf8");
assert.ok(access.includes('"songwriter"'));
assert.ok(access.includes('tool === "remover"'));
assert.ok(!access.includes('"musicgen"'));

const nav = readFileSync(
  path.join(root, "components", "student", "StudentNav.tsx"),
  "utf8"
);
assert.ok(!nav.includes("pocket-studio"));
assert.ok(!nav.includes("Студия"));
assert.ok(nav.includes("grid-cols-4"));

const sql = readFileSync(
  path.join(root, "supabase-migrations", "2026-08-26-ai-songwriter-tool.sql"),
  "utf8"
);
assert.ok(sql.includes("'songwriter'"));

console.log("songwriter via Groq + no MusicGen/Studio tab: ok");
