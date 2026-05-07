import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InsightAccordion } from "./InsightAccordion";

describe("InsightAccordion", () => {
  it("renders nothing when given an empty string", () => {
    const { container } = render(<InsightAccordion insight="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a single paragraph with NO toggle button", () => {
    render(<InsightAccordion insight="Just one thought." />);
    expect(screen.getByText("Just one thought.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("collapsed state shows only the first paragraph", () => {
    cleanup();
    render(
      <InsightAccordion
        insight={"Para one is here.\n\nPara two is hidden.\n\nPara three too."}
      />,
    );
    expect(screen.getByText("Para one is here.")).toBeInTheDocument();
    expect(screen.queryByText("Para two is hidden.")).not.toBeInTheDocument();
    expect(screen.queryByText("Para three too.")).not.toBeInTheDocument();
  });

  it("clicking toggle reveals all paragraphs and flips aria-expanded", () => {
    cleanup();
    render(<InsightAccordion insight={"First.\n\nSecond.\n\nThird."} />);
    const btn = screen.getByRole("button", { name: /show full insight/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(btn);

    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First.")).toBeInTheDocument();
    expect(screen.getByText("Second.")).toBeInTheDocument();
    expect(screen.getByText("Third.")).toBeInTheDocument();
  });

  it("a second click collapses back to the first paragraph", () => {
    cleanup();
    render(<InsightAccordion insight={"A.\n\nB."} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn); // expand
    fireEvent.click(btn); // collapse
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("A.")).toBeInTheDocument();
    expect(screen.queryByText("B.")).not.toBeInTheDocument();
  });

  it("ignores empty paragraphs caused by trailing/triple breaks", () => {
    cleanup();
    render(
      <InsightAccordion insight={"Real para.\n\n\n\n   \n\nSecond real."} />,
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    // 2 real paragraphs, no empty <p>
    const paragraphs = screen.getAllByText(/Real para\.|Second real\./);
    expect(paragraphs).toHaveLength(2);
  });
});
