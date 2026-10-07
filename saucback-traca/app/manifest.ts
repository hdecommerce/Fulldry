import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Traçabilité colis SaucBack",
    short_name: "Traça SaucBack",
    description: "Photo de l'étiquette, lot et date lus par Claude, traçabilité écrite dans Shopify.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#3eb4cf",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
