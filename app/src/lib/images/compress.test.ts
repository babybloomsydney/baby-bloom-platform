/**
 * Tests for compressImageForUpload — shared client-side image compression
 * utility extracted from `ImageUpload.tsx` per T-028 Wave 1.
 *
 * TDD: these cases were written RED before the implementation (per
 * `05-test-plan.md` §A). Behaviour under test mirrors the inline impl
 * shipped in HOTFIX-01 (commit 7ba16ac), generalised with a
 * CompressOptions argument.
 *
 * Canvas + Image are mocked because JSDOM doesn't implement them.
 * The mock layer is intentionally minimal — just enough to drive the
 * decision logic in compress.ts.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImageForUpload } from "./compress";

const TWO_MB = 2 * 1024 * 1024;

// Per-test mock state. Reset in beforeEach.
let mockImageWidth: number;
let mockImageHeight: number;
let mockImageShouldFail: boolean;
let mockToBlobByQuality: Map<number, Blob | null>;
let defaultToBlobFactory: (quality: number) => Blob | null;

// Original globals — restored in afterEach.
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalImage = globalThis.Image;

beforeEach(() => {
  mockImageWidth = 800;
  mockImageHeight = 600;
  mockImageShouldFail = false;
  mockToBlobByQuality = new Map();
  // Default: blob size scales with quality. q=0.85 → 3.4 MB, q=0.45 → 1.8 MB.
  // This means the default ladder will exit at q=0.45 for the 2 MB cap.
  defaultToBlobFactory = (q) =>
    new Blob([new Uint8Array(Math.max(1, Math.floor(q * 4 * 1024 * 1024)))], {
      type: "image/jpeg",
    });

  URL.createObjectURL = vi.fn(() => "blob:mock://stub");
  URL.revokeObjectURL = vi.fn();

  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    get width() {
      return mockImageWidth;
    }
    get height() {
      return mockImageHeight;
    }
    set src(_value: string) {
      // Mimic the async decode: fire on next microtask.
      queueMicrotask(() => {
        if (mockImageShouldFail) this.onerror?.();
        else this.onload?.();
      });
    }
  }
  globalThis.Image = MockImage as unknown as typeof Image;

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );

  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    _type?: string,
    quality?: number,
  ) {
    const q = quality ?? 0.9;
    if (mockToBlobByQuality.has(q)) {
      cb(mockToBlobByQuality.get(q) ?? null);
      return;
    }
    cb(defaultToBlobFactory(q));
  });
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  globalThis.Image = originalImage;
  vi.restoreAllMocks();
});

function makeFile(
  opts: { name?: string; type?: string; size?: number } = {},
): File {
  const { name = "photo.jpg", type = "image/jpeg", size = 1024 } = opts;
  return new File([new Uint8Array(size)], name, { type });
}

describe("compressImageForUpload", () => {
  it("1. fast-path — small JPG under cap returns same File reference unchanged", async () => {
    const file = makeFile({ size: 500 * 1024 }); // 500 KB
    const out = await compressImageForUpload(file);
    expect(out).toBe(file); // SAME reference — no copy
  });

  it("2. large JPG — re-encoded to JPEG Blob ≤ maxBytes", async () => {
    const file = makeFile({ size: 5 * 1024 * 1024 }); // 5 MB
    const out = await compressImageForUpload(file);
    expect(out).not.toBe(file);
    expect((out as Blob).type).toBe("image/jpeg");
    expect((out as Blob).size).toBeLessThanOrEqual(TWO_MB);
  });

  it("3. HEIC — always re-encoded to JPEG even when small", async () => {
    const file = makeFile({
      name: "live-photo.heic",
      type: "image/heic",
      size: 1000, // Even tiny HEIC re-encodes — not web-renderable as stored
    });
    const out = await compressImageForUpload(file);
    expect(out).not.toBe(file);
    expect((out as Blob).type).toBe("image/jpeg");
  });

  it("4. dimension downscale — 4000×6000 source produces canvas at ≤2000 px longest edge", async () => {
    mockImageWidth = 4000;
    mockImageHeight = 6000;
    const file = makeFile({ size: 5 * 1024 * 1024 });

    // Spy on canvas creation to inspect dimensions
    const created: HTMLCanvasElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === "canvas") created.push(el as HTMLCanvasElement);
        return el;
      });

    try {
      await compressImageForUpload(file);

      expect(created.length).toBeGreaterThan(0);
      const canvas = created[0];
      // scale = 2000 / 6000 ≈ 0.333; width = round(4000 * 0.333) = 1333; height = 2000
      expect(canvas.width).toBe(1333);
      expect(canvas.height).toBe(2000);
    } finally {
      // Restore document.createElement immediately — otherwise an assertion
      // failure leaves the global patched for any code path that runs
      // before afterEach fires (test isolation hardening per code-reviewer
      // M-3).
      createElementSpy.mockRestore();
    }
  });

  it("5. canvas decode failure — returns original File reference (fallback)", async () => {
    // Suppress the breadcrumb console.warn for clean test output —
    // the warn is the intentional observability hook added per the
    // silent-failure-hunter review.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockImageShouldFail = true;
    const file = makeFile({
      name: "broken.heic",
      type: "image/heic",
      size: 1000,
    });
    const out = await compressImageForUpload(file);
    expect(out).toBe(file); // Fell back to original on decode failure
  });

  it("6. custom maxBytes — returns Blob ≤ caller-specified cap", async () => {
    const file = makeFile({ size: 5 * 1024 * 1024 });
    // The default ladder won't produce ≤500 KB; override q=0.45 to fit.
    mockToBlobByQuality.set(
      0.45,
      new Blob([new Uint8Array(400 * 1024)], { type: "image/jpeg" }),
    );
    const out = await compressImageForUpload(file, { maxBytes: 500 * 1024 });
    expect((out as Blob).size).toBeLessThanOrEqual(500 * 1024);
  });

  it("7. forceReencode=true — small JPG is still re-encoded (no fast-path)", async () => {
    const file = makeFile({ size: 500 * 1024 }); // Would normally fast-path
    const out = await compressImageForUpload(file, { forceReencode: true });
    expect(out).not.toBe(file);
    expect((out as Blob).type).toBe("image/jpeg");
  });

  it("8. quality ladder exhausted — returns the last quality's result regardless of size", async () => {
    // Suppress the over-cap breadcrumb console.warn for clean test output.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = makeFile({ size: 5 * 1024 * 1024 });
    // Every quality (incl. last-resort 0.35) produces a too-large blob
    [0.85, 0.75, 0.65, 0.55, 0.45, 0.35].forEach((q) => {
      mockToBlobByQuality.set(
        q,
        new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/jpeg" }),
      );
    });
    const out = await compressImageForUpload(file);
    // None fit under 2 MB; return last entry's result anyway
    // (better degraded photo than failed upload).
    expect(out).not.toBe(file);
    expect((out as Blob).type).toBe("image/jpeg");
    expect((out as Blob).size).toBe(3 * 1024 * 1024);
  });

  it("9. qualities option — honours caller-supplied ladder (only tries those values)", async () => {
    const file = makeFile({ size: 5 * 1024 * 1024 });
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    await compressImageForUpload(file, { qualities: [0.7] });
    const qualitiesUsed = toBlobSpy.mock.calls.map((c) => c[2]);
    expect(qualitiesUsed).toEqual([0.7]); // No default ladder, no last-resort
  });

  it("10. URL.revokeObjectURL — called once after canvas roundtrip (cleanup in finally)", async () => {
    const file = makeFile({ size: 5 * 1024 * 1024 }); // Forces canvas path
    await compressImageForUpload(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock://stub");
  });
});
