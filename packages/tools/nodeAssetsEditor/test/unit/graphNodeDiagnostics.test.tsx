// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { GraphEditorState } from "../../src/nodeGraph/editorState";
import { CanvasViewController, type EditorContextValue } from "../../src/nodeGraph/editorContext";
import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { GraphNodeDiagnostics } from "../../src/nodeGraph/nodeDiagnostics";
import { CanvasContextProvider, type CanvasContextValue } from "../../src/nodeGraph/components/canvasContext";
import { GraphNodeView } from "../../src/nodeGraph/components/GraphNodeView";
import { PropertiesView } from "../../src/nodeGraph/components/PropertiesView";

describe("GraphNodeView diagnostics", () => {
    it("renders an accessible error marker for a diagnosed node", () => {
        const node: IGraphNode = {
            id: "node-42",
            title: "Export glTF",
            headerColor: "#2f8f83",
            position: { x: 0, y: 0 },
            collapsed: false,
            ports: [],
        };
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        const diagnostics = new GraphNodeDiagnostics();
        diagnostics.set(node.id, { severity: "error", message: "The export input is not connected." });
        const editor: EditorContextValue = {
            state,
            diagnostics,
            getPaletteCategories: () => [],
            buildPropertySections: () => [],
            view: new CanvasViewController(),
            createNodeFromPaletteItem: () => node,
        };
        const canvas: CanvasContextValue = {
            editor,
            beginNodeInteraction: () => undefined,
            beginFrameInteraction: () => undefined,
            beginPortInteraction: () => undefined,
            selectWire: () => undefined,
            openContextMenu: () => undefined,
            runWhenIdle: (action) => {
                action();
                return true;
            },
        };

        const markup = renderToStaticMarkup(
            <CanvasContextProvider value={canvas}>
                <GraphNodeView node={node} />
            </CanvasContextProvider>
        );

        expect(markup).toContain('data-node-error="true"');
        expect(markup).toContain("Error: The export input is not connected.");
    });

    it("updates the selected node's properties when its diagnostic changes", () => {
        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
        const node: IGraphNode = {
            id: "node-42",
            title: "Export glTF",
            headerColor: "#2f8f83",
            position: { x: 0, y: 0 },
            collapsed: false,
            ports: [],
        };
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        state.selectNodes([node.id]);
        const diagnostics = new GraphNodeDiagnostics();
        const context: EditorContextValue = {
            state,
            diagnostics,
            getPaletteCategories: () => [],
            buildPropertySections: (selectedNode) => {
                const diagnostic = diagnostics.get(selectedNode.id);
                return diagnostic
                    ? [
                          {
                              title: "Diagnostics",
                              properties: [
                                  {
                                      kind: "text",
                                      label: "Build error",
                                      value: diagnostic.message,
                                      disabled: true,
                                      onChange: () => undefined,
                                  },
                              ],
                          },
                      ]
                    : [];
            },
            view: new CanvasViewController(),
            createNodeFromPaletteItem: () => node,
        };
        const container = document.createElement("div");
        const root = createRoot(container);

        act(() => {
            root.render(<PropertiesView context={context} />);
        });
        expect(container.querySelector("input")).toBeNull();

        act(() => {
            diagnostics.set(node.id, { severity: "error", message: "The export input is not connected." });
        });
        expect(container.querySelector("input")?.value).toBe("The export input is not connected.");

        act(() => {
            diagnostics.clear();
        });
        expect(container.querySelector("input")).toBeNull();

        act(() => {
            root.unmount();
        });
    });
});
