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
    "Профессиональные уроки вокала в Екатеринбурге. Бесплатный кабинет, занятия с преподавателем, подписка на приложение — по желанию.",
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
      { url: "/icons/favicon-32.png?v=47", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png?v=47", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=47", sizes: "180x180" }],
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
  viewportFit: "cover",
};

const BOOT_SCRIPT = `(function(){
  function log(m){
    try{
      var a=JSON.parse(sessionStorage.getItem("uvs-logs")||"[]");
      a.push({t:Date.now(),e:String(m).slice(0,300)});
      sessionStorage.setItem("uvs-logs",JSON.stringify(a.slice(-40)));
    }catch(x){}
  }
  try{
    var t=localStorage.getItem("uvs-theme");
    if(t!=="dark"&&t!=="light") t="dark";
    document.documentElement.classList.toggle("light",t==="light");
    document.documentElement.style.colorScheme=t;
    document.documentElement.style.backgroundColor=t==="light"?"#f8f7fc":"#0a0a0f";
  }catch(e){
    document.documentElement.classList.remove("light");
    document.documentElement.style.colorScheme="dark";
    document.documentElement.style.backgroundColor="#0a0a0f";
  }
  var VER="58";
  try{
    if(localStorage.getItem("uvs-sw-bust")!==VER){
      var hadController=Boolean(navigator.serviceWorker&&navigator.serviceWorker.controller);
      var jobs=[];
      if(navigator.serviceWorker){
        jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){return r.unregister()}));
        }));
      }
      if(typeof caches!=="undefined"){
        jobs.push(caches.keys().then(function(keys){
          return Promise.all(keys.map(function(k){return caches.delete(k)}));
        }));
      }
      Promise.all(jobs).then(function(){
        try{localStorage.setItem("uvs-sw-bust",VER)}catch(x){}
        if(hadController) location.reload();
      }).catch(function(err){
        log(err);
        try{localStorage.setItem("uvs-sw-bust",VER)}catch(x){}
      });
    }
  }catch(e){log(e)}
  window.addEventListener("error",function(e){
    var el=e.target;
    log((e.message||"error")+" "+(el&&el.src||""));
    if(!el||el.tagName!=="SCRIPT"||!el.src||el.src.indexOf("/_next/")===-1)return;
    if(document.getElementById("uvs-boot-fail"))return;
    var d=document.createElement("div");
    d.id="uvs-boot-fail";
    d.setAttribute("style","position:fixed;inset:0;z-index:99999;background:#0a0a0f;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;padding:28px;max-width:40rem");
    d.innerHTML="<p style='font-size:1.25rem;margin:0 0 12px'>Сайт не загрузился</p><p>Сеть ещё открывает старый сервер, который отдаёт HTML вместо JavaScript.</p><p>Откройте <b>https://uniquevocal.ru</b> без www и обновите страницу.</p>";
    document.documentElement.appendChild(d);
  },true);
  window.addEventListener("unhandledrejection",function(e){
    log(e&&e.reason?e.reason:"unhandledrejection");
  });
  setTimeout(function(){
    if(document.documentElement.getAttribute("data-uvs-ready"))return;
    if(document.getElementById("uvs-boot-fail"))return;
    log("watchdog: no data-uvs-ready");
    var logs="";
    try{logs=(JSON.parse(sessionStorage.getItem("uvs-logs")||"[]").slice(-6).map(function(x){return x.e}).join("<br>"))}catch(x){}
    var d=document.createElement("div");
    d.id="uvs-boot-fail";
    d.setAttribute("style","position:fixed;inset:0;z-index:99999;background:#0a0a0f;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;padding:28px");
    d.innerHTML="<p style='font-size:1.25rem;margin:0 0 12px'>Страница не открылась на iPhone</p><p>Нажмите кнопку — это сбросит кэш Safari.</p><p><button type='button' id='uvs-boot-reload' style='margin-top:12px;padding:12px 18px;border:0;border-radius:12px;background:#8b5cf6;color:#fff;font:16px system-ui'>Обновить</button></p>"+(logs?"<p style='margin-top:16px;font:12px/1.4 ui-monospace,monospace;opacity:.7;word-break:break-word'>"+logs+"</p>":"");
    document.documentElement.appendChild(d);
    var b=document.getElementById("uvs-boot-reload");
    if(b) b.onclick=function(){
      try{sessionStorage.removeItem("uvs-logs")}catch(x){}
      try{localStorage.removeItem("uvs-sw-bust")}catch(x){}
      location.href="https://uniquevocal.ru/?_r="+Date.now();
    };
  },8000);
})();`;

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
