/**
 * Tests for ImageUpload — F-001 sub-task 3 (`02-fab-image-race-and-preview`).
 *
 * Behaviour under test:
 * 1. `onUploadingChange` fires `true` when a file is picked, `false`
 *    after the upload network round-trip resolves (success OR failure).
 * 2. Existing `onUploaded` continues to work — backwards compatible.
 * 3. Without a parent passing `onUploadingChange`, the component still
 *    works (legacy callers).
 * 4. Preview frame uses `aspect-square` + `object-contain` (full image,
 *    no cropping). Smoke-asserted via class names.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ImageUpload } from "./ImageUpload";

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeFile(name = "photo.jpg") {
  return new File(["fake-bytes"], name, { type: "image/jpeg" });
}

describe("ImageUpload — onUploadingChange callback", () => {
  it("fires true the moment a file is picked; false after upload resolves", async () => {
    const onUploadingChange = vi.fn();
    const onUploaded = vi.fn();
    // Defer the fetch resolution so we can observe the `true` window.
    let resolveFetch: (v: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((r) => {
      resolveFetch = r;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      fetchPromise as unknown as Promise<Response>,
    );

    const { container } = render(
      <ImageUpload
        childId="c1"
        onUploaded={onUploaded}
        onUploadingChange={onUploadingChange}
      />,
    );

    // Provider's effect runs on mount — initial false call is OK.
    onUploadingChange.mockClear();

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    // The `true` callback should fire while fetch is still pending.
    await waitFor(() => expect(onUploadingChange).toHaveBeenCalledWith(true));
    expect(onUploaded).not.toHaveBeenCalled();

    // Resolve the fetch with success.
    resolveFetch(
      new Response(JSON.stringify({ url: "https://cdn.test/photo.jpg" }), {
        status: 200,
      }),
    );

    await waitFor(() =>
      expect(onUploadingChange).toHaveBeenLastCalledWith(false),
    );
    expect(onUploaded).toHaveBeenCalledWith("https://cdn.test/photo.jpg");
  });

  it("fires false even when fetch throws (fail-open observability)", async () => {
    const onUploadingChange = vi.fn();
    const onUploaded = vi.fn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    // Suppress the deliberate console.error log from the catch block.
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(
      <ImageUpload
        childId="c1"
        onUploaded={onUploaded}
        onUploadingChange={onUploadingChange}
      />,
    );
    onUploadingChange.mockClear();

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() =>
      expect(onUploadingChange).toHaveBeenLastCalledWith(false),
    );
    expect(onUploaded).toHaveBeenCalledWith(null);
  });

  it("works without onUploadingChange (legacy callers)", async () => {
    const onUploaded = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn.test/x.jpg" }), {
        status: 200,
      }),
    );

    const { container } = render(
      <ImageUpload childId="c1" onUploaded={onUploaded} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith("https://cdn.test/x.jpg"),
    );
  });

  it("surfaces a user-visible error when the upload fails (no silent submit)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const onUploaded = vi.fn();
    const { container, findByRole } = render(
      <ImageUpload childId="c1" onUploaded={onUploaded} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    // The error region (role="alert") appears with a user-visible message.
    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/upload failed/i);
    // Parent receives null so the form can't submit with a stale URL.
    expect(onUploaded).toHaveBeenLastCalledWith(null);
  });

  it("clicking Remove during an in-flight upload aborts it and keeps onUploaded(null)", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    let rejectFetch: (e: unknown) => void = () => {};
    const fetchPromise = new Promise<Response>((res, rej) => {
      resolveFetch = res;
      rejectFetch = rej;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(((
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      // Hook the abort signal so .abort() rejects with AbortError.
      init?.signal?.addEventListener("abort", () => {
        rejectFetch(new DOMException("aborted", "AbortError"));
      });
      return fetchPromise as unknown as Promise<Response>;
    }) as typeof fetch);

    const onUploaded = vi.fn();
    const { container, findByLabelText } = render(
      <ImageUpload childId="c1" onUploaded={onUploaded} />,
    );

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    // Wait for the preview + Remove button to render.
    const removeButton = await findByLabelText("Remove photo");
    fireEvent.click(removeButton);

    // The fetch is aborted. If the abort path leaks, this resolve
    // would race-call onUploaded with the URL, defeating the fix.
    resolveFetch(
      new Response(JSON.stringify({ url: "https://cdn.test/x.jpg" }), {
        status: 200,
      }),
    );

    // Give microtasks a chance to flush.
    await new Promise((r) => setTimeout(r, 0));

    // The only `onUploaded` calls are the explicit `null` from
    // handleRemove. The CDN URL must NOT be propagated.
    const callArgs = onUploaded.mock.calls.map((c) => c[0]);
    expect(callArgs).not.toContain("https://cdn.test/x.jpg");
    expect(callArgs).toContain(null);
  });

  it("preview frame uses aspect-square + object-contain (full image, no crop)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn.test/x.jpg" }), {
        status: 200,
      }),
    );
    const { container } = render(
      <ImageUpload childId="c1" onUploaded={vi.fn()} />,
    );
    // Pick a file → preview renders.
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    // FileReader.readAsDataURL fires onload async; wait for the
    // preview <img> to appear.
    const img = await waitFor(() => {
      const el = container.querySelector(
        'img[alt="Upload preview"]',
      ) as HTMLImageElement | null;
      if (!el) throw new Error("preview not rendered yet");
      return el;
    });

    // `object-contain` on the image (NOT object-cover — that's the bug fix).
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");

    // Wrapper has aspect-square (1:1 frame).
    const frame = img.parentElement!;
    expect(frame.className).toContain("aspect-square");
  });
});
