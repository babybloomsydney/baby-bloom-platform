// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useTypewriter } from "./use-typewriter";

/**
 * Wrapper that exposes the hook's state to the test.
 */
function Probe({
  target,
  charsPerSecond,
  reducedMotion,
}: {
  target: string;
  charsPerSecond?: number;
  reducedMotion?: boolean;
}) {
  const visible = useTypewriter(target, { charsPerSecond, reducedMotion });
  return <div data-testid="visible">{visible}</div>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTypewriter", () => {
  it("starts empty when the target is empty", () => {
    const { getByTestId } = render(<Probe target="" charsPerSecond={50} />);
    expect(getByTestId("visible").textContent).toBe("");
  });

  it("advances toward the target at the configured rate", () => {
    const { getByTestId } = render(
      <Probe target="Hello world" charsPerSecond={100} />,
    );
    // Initial render: nothing visible yet (interval has not fired).
    expect(getByTestId("visible").textContent).toBe("");
    // 100 chars/sec = 10ms per char. After 30ms we should see ~3 chars.
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(getByTestId("visible").textContent?.length ?? 0).toBeGreaterThan(0);
    expect(getByTestId("visible").textContent?.length ?? 0).toBeLessThanOrEqual(
      4,
    );
    // Eventually catches up to the target.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByTestId("visible").textContent).toBe("Hello world");
  });

  it("renders the target immediately when reducedMotion is true", () => {
    const { getByTestId } = render(
      <Probe target="Hello world" reducedMotion={true} />,
    );
    // No timer advance — reduced motion bypasses the typewriter.
    expect(getByTestId("visible").textContent).toBe("Hello world");
  });

  it("appends new chars when the target grows mid-stream", () => {
    const { getByTestId, rerender } = render(
      <Probe target="Hi" charsPerSecond={100} />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByTestId("visible").textContent).toBe("Hi");
    rerender(<Probe target="Hi there" charsPerSecond={100} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByTestId("visible").textContent).toBe("Hi there");
  });

  it("resets cleanly when the target is replaced (e.g. new turn)", () => {
    const { getByTestId, rerender } = render(
      <Probe target="Old message" charsPerSecond={100} />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByTestId("visible").textContent).toBe("Old message");
    rerender(<Probe target="" charsPerSecond={100} />);
    // Empty target resets visible to empty without waiting for a tick.
    expect(getByTestId("visible").textContent).toBe("");
    rerender(<Probe target="New" charsPerSecond={100} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getByTestId("visible").textContent).toBe("New");
  });

  it("never displays text not yet in the target (prefix invariant)", () => {
    const { getByTestId } = render(
      <Probe target="abcdef" charsPerSecond={100} />,
    );
    for (let t = 0; t < 100; t += 10) {
      act(() => {
        vi.advanceTimersByTime(10);
      });
      const visible = getByTestId("visible").textContent ?? "";
      // Visible must always be a prefix of the target.
      expect("abcdef".startsWith(visible)).toBe(true);
    }
  });
});
