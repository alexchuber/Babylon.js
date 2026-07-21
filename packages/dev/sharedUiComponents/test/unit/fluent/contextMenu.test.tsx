// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ContextMenu } from "../../../src/fluent/primitives/contextMenu";

describe("ContextMenu", () => {
    it("closes an open custom-trigger menu and suppresses reopening when disabled", async () => {
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, NodeFilter: window.NodeFilter });
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onClick = vi.fn();
        const render = (disabled: boolean) => (
            <ContextMenu disabled={disabled} items={[{ key: "action", label: "Action", onClick }]} trigger={<div data-testid="custom-context-trigger">Trigger</div>} />
        );

        await act(async () => {
            root.render(render(false));
        });
        const trigger = container.querySelector('[data-testid="custom-context-trigger"]');
        if (!trigger) {
            throw new Error("The custom context-menu trigger did not render.");
        }

        await act(async () => {
            trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        });
        expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

        await act(async () => {
            root.render(render(true));
        });
        expect(document.body.querySelector('[role="menu"]')).toBeNull();

        await act(async () => {
            trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        });
        expect(document.body.querySelector('[role="menu"]')).toBeNull();
        expect(onClick).not.toHaveBeenCalled();

        await act(async () => {
            root.render(render(false));
        });
        await act(async () => {
            trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        });
        const menuItem = document.body.querySelector('[role="menuitem"]');
        if (!menuItem) {
            throw new Error("The custom context-menu action did not render after re-enabling.");
        }
        await act(async () => {
            menuItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(onClick).toHaveBeenCalledOnce();

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
