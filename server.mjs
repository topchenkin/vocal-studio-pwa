/**
 * Timeweb Cloud Apps runs this with `npm start`.
 * Same-origin `/sb` is reverse-proxied to the Supabase project so browsers
 * in Russia never talk to supabase.co (which ISPs often block).
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { request as httpsRequest } from "node:https";
import { parse } from "node:url";

const require = createRequire(import.meta.url);
const next = require("next");
const httpProxy = require("http-proxy");

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  ""
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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

function publicProxyBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}/sb`;
}

function targetPath(url) {
  const stripped = (url || "/").replace(/^\/sb(?=\/|$)/, "");
  return stripped || "/";
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

function proxyHttp(req, res) {
  if (!SUPABASE_ORIGIN) {
    res.statusCode = 502;
    res.end("NEXT_PUBLIC_SUPABASE_URL is not set");
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
      path: targetPath(req.url),
      method: req.method,
      headers,
    },
    (incoming) => {
      const contentType = String(incoming.headers["content-type"] || "");
      const rewrite =
        /json|javascript|xml|text\/plain/i.test(contentType) &&
        !/octet-stream/i.test(contentType);

      if (!rewrite) {
        res.writeHead(incoming.statusCode || 502, incoming.headers);
        incoming.pipe(res);
        return;
      }

      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => {
        let body = Buffer.concat(chunks).toString("utf8");
        const pub = publicProxyBase(req);
        if (SUPABASE_ORIGIN) {
          body = body.split(SUPABASE_ORIGIN).join(pub);
        }
        const outHeaders = { ...incoming.headers };
        delete outHeaders["content-encoding"];
        delete outHeaders["content-length"];
        outHeaders["content-length"] = Buffer.byteLength(body);
        res.writeHead(incoming.statusCode || 502, outHeaders);
        res.end(body);
      });
    }
  );

  upstream.on("error", (err) => {
    console.error("[sb-proxy]", err.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Supabase proxy failed");
    }
  });

  req.pipe(upstream);
}

const wsProxy = httpProxy.createProxyServer({
  target: SUPABASE_ORIGIN || "https://localhost",
  changeOrigin: true,
  ws: true,
  secure: true,
});

wsProxy.on("error", (err, _req, socket) => {
  console.error("[sb-proxy ws]", err.message);
  if (socket && !socket.destroyed) socket.destroy();
});

await app.prepare();

const server = createServer((req, res) => {
  if ((req.url || "").startsWith("/sb")) {
    proxyHttp(req, res);
    return;
  }
  handle(req, res, parse(req.url || "/", true));
});

server.on("upgrade", (req, socket, head) => {
  if (!(req.url || "").startsWith("/sb")) {
    socket.destroy();
    return;
  }
  if (!SUPABASE_ORIGIN) {
    socket.destroy();
    return;
  }
  req.url = targetPath(req.url);
  wsProxy.ws(req, socket, head);
});

server.listen(port, hostname, () => {
  console.log(
    `[unique-vocal] listening on ${hostname}:${port}` +
      (SUPABASE_ORIGIN ? ` (supabase proxy → ${SUPABASE_ORIGIN})` : "")
  );
});
