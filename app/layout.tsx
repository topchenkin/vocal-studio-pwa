import type { Metadata, Viewport } from "next";
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
            __html: `(function(){try{var t=localStorage.getItem("uvs-theme");if(t!=="dark"&&t!=="light"){t="dark"}document.documentElement.classList.toggle("light",t==="light");document.documentElement.style.colorScheme=t}catch(e){document.documentElement.classList.remove("light");document.documentElement.style.colorScheme="dark"}})();`,
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
