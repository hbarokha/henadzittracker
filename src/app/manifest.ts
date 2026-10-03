import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HenadziTracker",
    short_name: "Tracker",
    description: "Daily health, nutrition and training tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a08",
    theme_color: "#0c0a08",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
