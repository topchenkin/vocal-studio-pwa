import type { Metadata, Viewport } from "next";
/** next/font downloads at build time and ships woff2 from /_next/static/media — no Google Fonts at runtime. */
import { Cormorant_Garamond, Inter } from "next/font/google";
import AppProviders from "@/components/providers/AppProviders";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PushNavigationListener from "@/components/pwa/PushNavigationListener";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/constants";
import { APP_RELEASE } from "@/lib/app-release";
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
  var VER=${JSON.stringify(APP_RELEASE)};
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
  function wipe(){
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
    return Promise.all(jobs);
  }
  function reloads(){
    try{return Number(sessionStorage.getItem("uvs-boot-reloads")||"0")||0}catch(x){return 0}
  }
  function hardReload(){
    try{sessionStorage.setItem("uvs-sw-hold","1")}catch(x){}
    var u=new URL(location.href);
    u.searchParams.set("_uvs",VER);
    u.searchParams.set("_t",String(Date.now()));
    location.replace(u.href);
  }
  var busy=false;
  function recover(){
    if(busy||reloads()>=2) return false;
    busy=true;
    try{sessionStorage.setItem("uvs-boot-reloads",String(reloads()+1))}catch(x){}
    try{localStorage.removeItem("uvs-sw-bust")}catch(x){}
    document.documentElement.setAttribute("data-uvs-busting","1");
    wipe().then(hardReload).catch(hardReload);
    return true;
  }
  try{
    var seen=localStorage.getItem("uvs-sw-bust");
    var wiped=false;
    try{wiped=sessionStorage.getItem("uvs-wiped")===VER}catch(x){}
    if(seen!==VER && !wiped){
      busy=true;
      try{sessionStorage.setItem("uvs-wiped",VER)}catch(x){}
      try{sessionStorage.setItem("uvs-sw-hold","1")}catch(x){}
      try{sessionStorage.setItem("uvs-boot-reloads",String(Math.max(1,reloads())))}catch(x){}
      document.documentElement.setAttribute("data-uvs-busting","1");
      wipe().then(hardReload).catch(hardReload);
    } else if(seen===VER){
      try{sessionStorage.removeItem("uvs-sw-hold")}catch(x){}
      try{sessionStorage.removeItem("uvs-boot-reloads")}catch(x){}
      try{sessionStorage.removeItem("uvs-wiped")}catch(x){}
    }
  }catch(e){log(e)}
  window.addEventListener("error",function(e){
    var el=e.target;
    if(!el||el.tagName!=="SCRIPT"||!el.src)return;
    if(el.src.indexOf("/_next/")===-1&&el.src.indexOf("/worker-")===-1&&el.src.indexOf("/sw.js")===-1)return;
    log("script "+el.src);
    recover();
  },true);
  window.addEventListener("unhandledrejection",function(e){
    log(e&&e.reason?e.reason:"unhandledrejection");
  });
  setTimeout(function(){
    if(document.documentElement.getAttribute("data-uvs-ready"))return;
    if(document.documentElement.getAttribute("data-uvs-busting"))return;
    if(recover())return;
    if(document.getElementById("uvs-boot-fail"))return;
    var d=document.createElement("div");
    d.id="uvs-boot-fail";
    d.setAttribute("style","position:fixed;inset:0;z-index:99999;background:#0a0a0f;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;padding:28px;max-width:40rem");
    d.innerHTML="<p style='font-size:1.25rem;margin:0 0 12px'>Обновляем приложение</p><p>На iPhone иногда остаётся старая копия. Нажмите кнопку — кэш сбросится сам.</p><p><button type='button' id='uvs-boot-reload' style='margin-top:12px;padding:12px 18px;border:0;border-radius:12px;background:#8b5cf6;color:#fff;font:16px system-ui'>Обновить</button></p>";
    document.documentElement.appendChild(d);
    var b=document.getElementById("uvs-boot-reload");
    if(b) b.onclick=function(){
      busy=false;
      try{sessionStorage.removeItem("uvs-logs")}catch(x){}
      try{sessionStorage.removeItem("uvs-boot-reloads")}catch(x){}
      try{sessionStorage.removeItem("uvs-wiped")}catch(x){}
      try{localStorage.removeItem("uvs-sw-bust")}catch(x){}
      recover();
    };
  },5000);
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
      data-uvs-ver={APP_RELEASE}
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
