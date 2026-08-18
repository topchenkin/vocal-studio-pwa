/**
 * Reverse-proxy for Supabase. Run on a host that can reach supabase.co
 * (Amsterdam VPS is the intended production path; BlancVPN TUN is fallback).
 *
 *   set SUPABASE_ORIGIN=https://xxxx.supabase.co
 *   set PROXY_PUBLIC_ORIGIN=https://sb.uniquevocal.ru
 *   set ALLOW_ORIGIN=https://www.uniquevocal.ru
 *   node deploy/sb-proxy/server.mjs
 *
 * Bind 127.0.0.1 and put Caddy (HTTPS) in front. Do not expose this raw.
 */
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import tls from "node:tls";

const PORT = Number(process.env.PORT) || 8787;
const BIND = process.env.BIND || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const SUPABASE_ORIGIN = (process.env.SUPABASE_ORIGIN || "").replace(/\/$/, "");
const PROXY_PUBLIC_ORIGIN = (
  process.env.PROXY_PUBLIC_ORIGIN || ""
).replace(/\/$/, "");
const ALLOW_ORIGIN =
  process.env.ALLOW_ORIGIN || "https://www.uniquevocal.ru";

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function corsHeaders() {
  return {
    "access-control-allow-origin": ALLOW_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept, accept-profile, content-profile",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function copyHeaders(source, extra = {}) {
  const headers = { ...extra };
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    if (HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "host") continue;
    headers[key] = value;
  }
  return headers;
}

function rewriteBody(text) {
  if (!SUPABASE_ORIGIN || !PROXY_PUBLIC_ORIGIN) return text;
  return text.split(SUPABASE_ORIGIN).join(PROXY_PUBLIC_ORIGIN);
}

function proxyHttp(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const pathOnly = (req.url || "/").split("?")[0];
  if (pathOnly === "/__health") {
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      ...corsHeaders(),
    });
    res.end("ok");
    return;
  }

  if (!SUPABASE_ORIGIN) {
    res.writeHead(500, corsHeaders());
    res.end("SUPABASE_ORIGIN is not set");
    return;
  }

  const target = new URL(SUPABASE_ORIGIN);
  const headers = copyHeaders(req.headers, {
    host: target.host,
    "accept-encoding": "identity",
  });

  const upstream = httpsRequest(
    {
      hostname: target.hostname,
      port: 443,
      path: req.url || "/",
      method: req.method,
      headers,
    },
    (incoming) => {
      const contentType = String(incoming.headers["content-type"] || "");
      const rewrite = /json|javascript|xml|text\/plain/i.test(contentType);

      const outHeaders = {
        ...incoming.headers,
        ...corsHeaders(),
      };
      delete outHeaders["content-encoding"];

      if (!rewrite) {
        res.writeHead(incoming.statusCode || 502, outHeaders);
        incoming.pipe(res);
        return;
      }

      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => {
        const body = rewriteBody(Buffer.concat(chunks).toString("utf8"));
        outHeaders["content-length"] = Buffer.byteLength(body);
        res.writeHead(incoming.statusCode || 502, outHeaders);
        res.end(body);
      });
    }
  );

  upstream.on("error", (err) => {
    console.error("[sb-proxy]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, corsHeaders());
      res.end("Supabase upstream failed");
    }
  });

  req.pipe(upstream);
}

function proxyWs(req, socket, head) {
  if (!SUPABASE_ORIGIN) {
    socket.destroy();
    return;
  }
  const target = new URL(SUPABASE_ORIGIN);
  const proxy = tls.connect(
    { host: target.hostname, port: 443, servername: target.hostname },
    () => {
      const lines = [`GET ${req.url || "/"} HTTP/1.1`, `Host: ${target.host}`];
      for (const [key, value] of Object.entries(req.headers)) {
        if (!value || key.toLowerCase() === "host") continue;
        lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
      }
      proxy.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head && head.length) proxy.write(head);
      proxy.pipe(socket);
      socket.pipe(proxy);
    }
  );
  proxy.on("error", () => socket.destroy());
  socket.on("error", () => proxy.destroy());
}

const server = createServer(proxyHttp);
server.on("upgrade", proxyWs);

server.listen(PORT, BIND, () => {
  if (!SUPABASE_ORIGIN) {
    console.warn("[sb-proxy] set SUPABASE_ORIGIN before serving traffic");
  }
  console.log(
    `[sb-proxy] ${BIND}:${PORT} → ${SUPABASE_ORIGIN || "(unset)"}  CORS ${ALLOW_ORIGIN}`
  );
});
