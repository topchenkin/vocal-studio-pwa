import type { Metadata, Viewport } from "next";
/** next/font downloads at build time and ships woff2 from /_next/static/media — no Google Fonts at runtime. */
import { Cormorant_Garamond, Inter } from "next/font/google";
import AppProviders from "@/components/providers/AppProviders";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PushNavigationListener from "@/components/pwa/PushNavigationListener";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/constants";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.uniquevocal.ru"),
  alternates: {
    canonical: "/",
  },
  title: `${APP_NAME} — Студия вокала`,
  description:
    "Профессиональные уроки вокала. Выберите абонемент и запишитесь на занятие.",
  applicationName: APP_SHORT_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_SHORT_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
    { media: "(prefers-color-scheme: light)", color: "#f8f7fc" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("uvs-theme");if(t!=="dark"&&t!=="light"){t="dark"}document.documentElement.classList.toggle("light",t==="light");document.documentElement.style.colorScheme=t}catch(e){document.documentElement.classList.remove("light");document.documentElement.style.colorScheme="dark"}var VER="16";try{if(localStorage.getItem("uvs-sw-bust")!==VER){var bust=false;var jobs=[];if(navigator.serviceWorker){jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){if(rs.length){bust=true;return Promise.all(rs.map(function(r){return r.unregister()}))}}))}if(typeof caches!=="undefined"){jobs.push(caches.keys().then(function(keys){if(keys.length){bust=true;return Promise.all(keys.map(function(k){return caches.delete(k)}))}}))}Promise.all(jobs).then(function(){try{localStorage.setItem("uvs-sw-bust",VER)}catch(x){}if(bust)location.reload()}).catch(function(){try{localStorage.setItem("uvs-sw-bust",VER)}catch(x){}})}}catch(e){}window.addEventListener("error",function(e){var el=e.target;if(!el||el.tagName!=="SCRIPT"||!el.src||el.src.indexOf("/_next/")===-1)return;if(document.getElementById("uvs-boot-fail"))return;var d=document.createElement("div");d.id="uvs-boot-fail";d.setAttribute("style","position:fixed;inset:0;z-index:99999;background:#0a0a0f;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;padding:28px;max-width:40rem");d.innerHTML="<p style='font-size:1.25rem;margin:0 0 12px'>Сайт не загрузился</p><p>Сеть ещё открывает старый сервер, который отдаёт HTML вместо JavaScript.</p><p>Откройте <b>https://uniquevocal.ru</b> без www или поставьте DNS 8.8.8.8 и обновите страницу.</p>";document.documentElement.appendChild(d)},true)})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${display.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: BOOT_SCRIPT,
          }}
        />
      </head>
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
        <InstallPrompt />
        <PushNavigationListener />
      </body>
    </html>
  );
}
