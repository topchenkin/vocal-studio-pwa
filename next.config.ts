import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const DAY = 24 * 60 * 60;

/**
 * Timeweb Cloud Apps runs Node (`npm start` → server.mjs). Do not use
 * `output: "export"` here: a static site cannot proxy supabase.co, which
 * Russian ISPs often block. Same-origin `/sb` is reverse-proxied instead.
 *
 * Static hashed assets are CacheFirst. HTML stays NetworkFirst.
 * Never cache `/api` or `/sb` (live backend).
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
    cacheId: "uvs-timeweb-v4",
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    navigateFallbackDenylist: [/^\/api\//, /^\/sb(\/|$)/],
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
          !pathname.startsWith("/api/") &&
          !pathname.startsWith("/sb"),
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
          !pathname.startsWith("/api/") &&
          !pathname.startsWith("/sb"),
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-rsc",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 32, maxAgeSeconds: DAY },
        },
      },
      {
        urlPattern: ({ url: { pathname }, sameOrigin }) =>
          sameOrigin &&
          !pathname.startsWith("/api/") &&
          !pathname.startsWith("/sb"),
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
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@breezystack/lamejs"],
};

export default withPWA(nextConfig);
