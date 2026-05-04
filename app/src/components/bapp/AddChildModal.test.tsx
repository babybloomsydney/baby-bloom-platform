import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddChildModal } from "./AddChildModal";

describe("AddChildModal", () => {
  it("invokes onAddNew and closes the modal when Add new is tapped", () => {
    const onAddNew = vi.fn();
    const onConnect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AddChildModal
        open
        onOpenChange={onOpenChange}
        role="parent"
        onAddNew={onAddNew}
        onConnectExisting={onConnect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add new child/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddNew).toHaveBeenCalledTimes(1);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("invokes onConnectExisting and closes the modal when Connect is tapped", () => {
    const onAddNew = vi.fn();
    const onConnect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AddChildModal
        open
        onOpenChange={onOpenChange}
        role="parent"
        onAddNew={onAddNew}
        onConnectExisting={onConnect}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /connect existing child/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onAddNew).not.toHaveBeenCalled();
  });

  it("varies the connect-existing subtitle by role", () => {
    const noop = () => {};
    const { rerender } = render(
      <AddChildModal
        open
        onOpenChange={noop}
        role="parent"
        onAddNew={noop}
        onConnectExisting={noop}
      />,
    );
    expect(
      screen.getByText(/invite link from your nanny/i),
    ).toBeInTheDocument();

    rerender(
      <AddChildModal
        open
        onOpenChange={noop}
        role="nanny"
        onAddNew={noop}
        onConnectExisting={noop}
      />,
    );
    expect(screen.getByText(/invite link from a parent/i)).toBeInTheDocument();
  });
});
