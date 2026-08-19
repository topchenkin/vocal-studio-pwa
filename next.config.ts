import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Timeweb Next.js Apps (and a plain `next build`) fail with
 * `output: "export"` while `app/api` and `middleware.ts` exist.
 * Stash them for the production build, then restore on process exit.
 * `npm run build` still uses scripts/build-static.mjs as a second guard.
 */
if (process.env.NEXT_PHASE === "phase-production-build") {
  const root = process.cwd();
  const stashDir = path.join(root, ".static-export-stash");
  const apiSrc = path.join(root, "app", "api");
  const apiDst = path.join(stashDir, "api");
  const mwSrc = path.join(root, "middleware.ts");
  const mwDst = path.join(stashDir, "middleware.ts");

  /** Copy then delete — `renameSync()` throws EXDEV across Docker overlay mounts. */
  const movePath = (src: string, dest: string) => {
    fs.cpSync(src, dest, { recursive: true, force: true });
    fs.rmSync(src, { recursive: true, force: true });
  };

  fs.mkdirSync(stashDir, { recursive: true });
  if (fs.existsSync(apiSrc) && !fs.existsSync(apiDst)) {
    movePath(apiSrc, apiDst);
  }
  if (fs.existsSync(mwSrc) && !fs.existsSync(mwDst)) {
    movePath(mwSrc, mwDst);
  }

  const restore = () => {
    try {
      if (fs.existsSync(apiDst) && !fs.existsSync(apiSrc)) {
        movePath(apiDst, apiSrc);
      }
      if (fs.existsSync(mwDst) && !fs.existsSync(mwSrc)) {
        movePath(mwDst, mwSrc);
      }
    } catch {
      /* ignore restore races between next.config and build-static.mjs */
    }
  };

  process.once("exit", restore);
  process.once("SIGINT", () => {
    restore();
    process.exit(1);
  });
  process.once("SIGTERM", () => {
    restore();
    process.exit(1);
  });
}

const DAY = 24 * 60 * 60;

/**
 * Static hashed assets are CacheFirst (Timeweb IP is stable). HTML stays
 * NetworkFirst with a short timeout so updates appear without hanging.
 * Default next-pwa rules also cache Google Fonts and ALL cross-origin
 * traffic (including supabase.co) — that makes a blocked API look like a
 * hung PWA. Same-origin only; never cache the API.
 */
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: false,
  reloadOnOnline: false,
  cacheStartUrl: true,
  fallbacks: {
    document: "/offline",
  },
  extendDefaultRuntimeCaching: false,
  workboxOptions: {
    cacheId: "uvs-moscow-v9",
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    navigateFallbackDenylist: [/^\/api\//],
    exclude: [
      /\.map$/,
      /^manifest.*\.js$/,
      /static\/chunks\//,
      /static\/css\//,
      /^CNAME$/,
    ],
    runtimeCaching: [
      {
        urlPattern: /\/_next\/static.+\.(js|css)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-assets",
          expiration: { maxEntries: 64, maxAgeSeconds: DAY * 30 },
        },
      },
      {
        urlPattern: /\/_next\/static\/media.+\.woff2$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-fonts",
          expiration: { maxEntries: 16, maxAgeSeconds: DAY * 30 },
        },
      },
      {
        urlPattern: /\/icons\/.+\.png$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "app-icons",
          expiration: { maxEntries: 16, maxAgeSeconds: DAY * 30 },
        },
      },
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get("RSC") === "1" &&
          request.headers.get("Next-Router-Prefetch") === "1" &&
          sameOrigin &&
          !pathname.startsWith("/api/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-rsc-prefetch",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 32, maxAgeSeconds: DAY },
        },
      },
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get("RSC") === "1" &&
          sameOrigin &&
          !pathname.startsWith("/api/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-rsc",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 32, maxAgeSeconds: DAY },
        },
      },
      {
        urlPattern: ({ url: { pathname }, sameOrigin }) =>
          sameOrigin && !pathname.startsWith("/api/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 32, maxAgeSeconds: DAY },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@breezystack/lamejs"],
};

export default withPWA(nextConfig);
