import type { MetadataRoute } from "next";

import { appConfig } from "@/config/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name,
    short_name: appConfig.shortName,
    description: appConfig.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#163038",
    lang: appConfig.defaultLocale,
    dir: "auto",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
