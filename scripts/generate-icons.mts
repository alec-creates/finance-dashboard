/**
 * Renders the app's PNG icons (PWA manifest and Apple touch icon) with Next.js's own image renderer, so no image
 * dependency is needed. Run after changing the mark, then commit the PNGs:
 *
 *   npx tsx scripts/generate-icons.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import { createElement as h } from "react";

const BACKGROUND = "#171717";
const FOREGROUND = "#fafafa";
// lucide "wallet-minimal" (ISC licence), drawn on a 24 x 24 grid.
const GLYPH = [
  "M17 14h.01",
  "M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14",
];

/**
 * `glyphShare` is the glyph's width as a share of the icon. Maskable icons keep it inside the central safe zone
 * (a circle of 80% of the width), and use a full-bleed background without rounded corners.
 */
async function render(
  size: number,
  { rounded, glyphShare }: { rounded: boolean; glyphShare: number },
): Promise<Buffer> {
  const glyph = Math.round(size * glyphShare);
  const element = h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      },
    },
    h(
      "svg",
      {
        width: glyph,
        height: glyph,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: FOREGROUND,
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      },
      ...GLYPH.map((d) => h("path", { key: d, d })),
    ),
  );
  const response = new ImageResponse(element, { width: size, height: size });
  return Buffer.from(await response.arrayBuffer());
}

const root = process.cwd();
mkdirSync(join(root, "public", "icons"), { recursive: true });
const outputs: [string, Promise<Buffer>][] = [
  [
    "public/icons/icon-192.png",
    render(192, { rounded: true, glyphShare: 0.56 }),
  ],
  [
    "public/icons/icon-512.png",
    render(512, { rounded: true, glyphShare: 0.56 }),
  ],
  [
    "public/icons/maskable-512.png",
    render(512, { rounded: false, glyphShare: 0.44 }),
  ],
  // iOS applies its own rounded mask and ignores transparency.
  ["src/app/apple-icon.png", render(180, { rounded: false, glyphShare: 0.56 })],
];
for (const [path, image] of outputs) {
  writeFileSync(join(root, path), await image);
  console.log(`wrote ${path}`);
}
