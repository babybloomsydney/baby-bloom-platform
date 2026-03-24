import { ImageResponse } from "next/og";
import { getPublicNannyProfile } from "@/lib/actions/nanny";
import sharp from "sharp";

// Canvas: 1200 x 630
// Left square: 630 x 630
// Gap: 4px
// Right area: 566 x 630
//   2 cols with 1 gap: (566 - 4) / 2 = 281 each
//   2 rows with 1 gap: (630 - 4) / 2 = 313 each
//   All 4 cells: 281 x 313 (identical)

const TIME_SLOTS = ["Morning (6am-10am)", "Midday (10am-2pm)", "Afternoon (2pm-6pm)", "Evening (6pm-10pm)"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

async function fetchAndCrop(url: string, w: number, h: number): Promise<string | null> {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const cropped = await sharp(Buffer.from(buffer))
      .rotate()
      .resize(w, h, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${cropped.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Render a 7×4 availability grid with header/label bars, blur it, return as base64 PNG */
async function generateBlurredGrid(
  schedule: Record<string, unknown> | null,
  w: number,
  h: number
): Promise<string> {
  const grid: boolean[][] = DAYS.map((day) => {
    const raw = schedule?.[day];
    if (!raw || !Array.isArray(raw)) return [false, false, false, false];
    return TIME_SLOTS.map((slot) => (raw as string[]).includes(slot));
  });

  const pad = 4;
  const gap = 4;
  const cols = 4;
  const rows = 7;
  const headerH = Math.round(h * 0.06);
  const labelW = Math.round(w * 0.12);
  const cellW = Math.floor((w - pad * 2 - labelW - gap * cols) / cols);
  const cellH = Math.floor((h - pad * 2 - headerH - gap * rows) / rows);

  const composites: { input: Buffer; left: number; top: number }[] = [];

  // Column header bars (4 grey rectangles across the top)
  for (let c = 0; c < cols; c++) {
    const x = pad + labelW + gap + c * (cellW + gap);
    const bar = await sharp({
      create: { width: cellW, height: headerH, channels: 4, background: { r: 180, g: 190, b: 200, alpha: 255 } },
    }).png().toBuffer();
    composites.push({ input: bar, left: x, top: pad });
  }

  // Row label bars + cells
  for (let r = 0; r < rows; r++) {
    const y = pad + headerH + gap + r * (cellH + gap);
    // Day label bar
    const label = await sharp({
      create: { width: labelW, height: cellH, channels: 4, background: { r: 160, g: 170, b: 185, alpha: 255 } },
    }).png().toBuffer();
    composites.push({ input: label, left: pad, top: y });

    // Grid cells
    for (let c = 0; c < cols; c++) {
      const x = pad + labelW + gap + c * (cellW + gap);
      const on = grid[r][c];
      const rect = await sharp({
        create: {
          width: cellW,
          height: cellH,
          channels: 4,
          background: on
            ? { r: 139, g: 92, b: 246, alpha: 255 }
            : { r: 226, g: 232, b: 240, alpha: 255 },
        },
      }).png().toBuffer();
      composites.push({ input: rect, left: x, top: y });
    }
  }

  const gridBuf = await sharp({
    create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const blurred = await sharp(gridBuf).blur(25).png().toBuffer();
  return `data:image/png;base64,${blurred.toString("base64")}`;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { data: nanny } = await getPublicNannyProfile(params.id);
  if (!nanny) return new Response("Nanny not found", { status: 404 });

  const photoUrls: string[] = [];
  if (nanny.profile_picture_url) photoUrls.push(nanny.profile_picture_url);
  if (nanny.additional_photos) {
    for (const url of nanny.additional_photos) {
      if (url) photoUrls.push(url);
    }
  }

  // Pre-crop images to exact pixel dimensions with sharp
  const [leftImg, ...rightUrls] = photoUrls;
  const [leftSrc, ...rightSrcs] = await Promise.all([
    leftImg ? fetchAndCrop(leftImg, 630, 630) : Promise.resolve(null),
    ...[rightUrls[0], rightUrls[1], rightUrls[2]].map((url) =>
      url ? fetchAndCrop(url, 281, 313) : Promise.resolve(null)
    ),
  ]);

  // Blurred availability grids
  const schedule = nanny.availability?.schedule as Record<string, unknown> | null;
  const gridSmall = await generateBlurredGrid(schedule, 281, 313);
  // Full right-side grid (570×630) for single-photo layout — flush against left image
  const hasAnyRightPhoto = rightSrcs.some((s) => s !== null);
  const gridFull = !hasAnyRightPhoto
    ? await generateBlurredGrid(schedule, 570, 630)
    : null;

  const response = new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative", overflow: "hidden", backgroundColor: "white" }}>

        {/* Left — 630x630 square */}
        {leftSrc ? (
          <img src={leftSrc} width={630} height={630} style={{ position: "absolute", top: 0, left: 0, width: 630, height: 630 }} />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: 630, height: 630, backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
              <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
            </svg>
          </div>
        )}

        {gridFull ? (
          /* Single-photo layout: full blurred grid across entire right side */
          <div style={{
            position: "absolute", top: 0, left: 630, width: 570, height: 630,
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            <img src={gridFull} width={570} height={630} style={{ position: "absolute", top: 0, left: 0, width: 570, height: 630 }} />
            <div style={{
              position: "absolute", top: 0, left: 0, width: 570, height: 630,
              backgroundColor: "rgba(255,255,255,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#6b7280", fontSize: 100, fontWeight: 700,
            }}>
              +
            </div>
          </div>
        ) : (
          /* Multi-photo layout: 2×2 grid */
          <>
            {/* Top-left — 281x313 at (634, 0) */}
            {rightSrcs[0] ? (
              <img src={rightSrcs[0]} width={281} height={313} style={{ position: "absolute", top: 0, left: 634, width: 281, height: 313 }} />
            ) : (
              <div style={{ position: "absolute", top: 0, left: 634, width: 281, height: 313, backgroundColor: "#f1f5f9" }} />
            )}

            {/* Top-right — 281x313 at (919, 0) */}
            {rightSrcs[1] ? (
              <img src={rightSrcs[1]} width={281} height={313} style={{ position: "absolute", top: 0, left: 919, width: 281, height: 313 }} />
            ) : (
              <div style={{ position: "absolute", top: 0, left: 919, width: 281, height: 313, backgroundColor: "#f1f5f9" }} />
            )}

            {/* Bottom-left — 281x313 at (634, 317) */}
            {rightSrcs[2] ? (
              <img src={rightSrcs[2]} width={281} height={313} style={{ position: "absolute", top: 317, left: 634, width: 281, height: 313 }} />
            ) : (
              <div style={{ position: "absolute", top: 317, left: 634, width: 281, height: 313, backgroundColor: "#f1f5f9" }} />
            )}

            {/* Bottom-right — 281x313 at (919, 317) — blurred availability grid with "+" */}
            <div style={{
              position: "absolute", top: 317, left: 919, width: 281, height: 313,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              <img src={gridSmall} width={281} height={313} style={{ position: "absolute", top: 0, left: 0, width: 281, height: 313 }} />
              <div style={{
                position: "absolute", top: 0, left: 0, width: 281, height: 313,
                backgroundColor: "rgba(255,255,255,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#6b7280", fontSize: 80, fontWeight: 700,
              }}>
                +
              </div>
            </div>
          </>
        )}
      </div>
    ),
    { width: 1200, height: 630 }
  );

  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return response;
}
