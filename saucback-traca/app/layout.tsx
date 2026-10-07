import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Traçabilité colis SaucBack",
  description: "Photo de l'étiquette → lot et date → note Shopify.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Traça SaucBack", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#3eb4cf",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Jost:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
