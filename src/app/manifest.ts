import type { MetadataRoute } from "next";

/** Lets the app be installed on a phone or desktop. No offline mode: financial data always comes from the server. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Finance Dashboard",
    short_name: "Finance",
    description:
      "Personal finance dashboard for budgets, investments, net worth and forecasts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
