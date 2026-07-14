import { describe, expect, it, vi } from "vitest";

import { GraphEditorState } from "../../../src/nodeGraph/editorState";
import { type IGraphNode } from "../../../src/nodeGraph/graphModel";

function CreateNode(id: string, direction: "input" | "output"): IGraphNode {
    return {
        id,
        title: id,
        headerColor: "#000000",
        position: { x: 0, y: 0 },
        collapsed: false,
        ports: [{ id: `${id}-${direction}`, name: direction, direction, color: "#000000" }],
    };
}

describe("GraphEditorState", () => {
    it("classifies visual and content changes at the editor-state interface", () => {
        const node = CreateNode("source", "output");
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.translateNodes([node.id], { x: 10, y: 5 });
        state.addNode(CreateNode("target", "input"));

        expect(changes).toEqual(["visual", "content"]);
        observer.remove();
    });

    it("classifies presentation-only editor mutations as visual", () => {
        const node = CreateNode("source", "output");
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.setNodeCollapsed(node.id, true);
        state.addFrame({
            id: "frame",
            label: "Frame",
            color: "#ffffff",
            position: { x: 0, y: 0 },
            size: { width: 100, height: 100 },
            nodeIds: [node.id],
            collapsed: false,
        });
        state.setFrameCollapsed("frame", true);
        state.beginInteraction();
        state.translateNodes([node.id], { x: 1, y: 1 });
        state.endInteraction(true);

        expect(changes).toEqual(["visual", "visual", "visual", "visual", "visual"]);
        observer.remove();
    });

    it("retains a visual change kind through undo and redo", () => {
        const node = CreateNode("source", "output");
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.beginInteraction();
        state.translateNodes([node.id], { x: 10, y: 5 });
        state.endInteraction(true);
        changes.length = 0;

        state.undo();
        state.redo();

        expect(changes).toEqual(["visual", "visual"]);
        observer.remove();
    });

    it("retains a content change kind through undo and redo", () => {
        const state = new GraphEditorState({ nodes: [CreateNode("source", "output")], wires: [], frames: [] });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.addNode(CreateNode("target", "input"));
        changes.length = 0;

        state.undo();
        state.redo();

        expect(changes).toEqual(["content", "content"]);
        expect(state.nodes).toHaveLength(2);
        observer.remove();
    });

    it("does not notify for no-op mutations", () => {
        const node = CreateNode("source", "output");
        const state = new GraphEditorState({ nodes: [node], wires: [], frames: [] });
        let changes = 0;
        const observer = state.onChanged.add(() => changes++);

        state.removeNodes([]);
        state.removeNodes(["missing"]);
        state.setNodeCollapsed(node.id, false);
        state.translateNodes([], { x: 10, y: 5 });
        state.translateNodes([node.id], { x: 0, y: 0 });

        expect(changes).toBe(0);
        expect(state.changeVersion).toBe(0);
        observer.remove();
    });

    it("reports an empty frame translation as a visual change", () => {
        const state = new GraphEditorState({
            nodes: [],
            wires: [],
            frames: [
                {
                    id: "frame",
                    label: "Frame",
                    color: "#ffffff",
                    position: { x: 0, y: 0 },
                    size: { width: 100, height: 100 },
                    nodeIds: [],
                    collapsed: false,
                },
            ],
        });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.translateFrame("frame", { x: 10, y: 5 });

        expect(state.frames[0].position).toEqual({ x: 10, y: 5 });
        expect(changes).toEqual(["visual"]);
        observer.remove();
    });

    it("treats an unclassified host notification as content", () => {
        const state = new GraphEditorState({ nodes: [], wires: [], frames: [] });
        const changes: unknown[] = [];
        const observer = state.onChanged.add((kind) => changes.push(kind));

        state.notifyChanged();

        expect(changes).toEqual(["content"]);
        observer.remove();
    });

    it("preserves generic wire behavior when no host compatibility rule is supplied", () => {
        const state = new GraphEditorState({
            nodes: [CreateNode("source", "output"), CreateNode("target", "input")],
            wires: [],
            frames: [],
        });

        expect(state.addWire("source-output", "target-input")).toBeDefined();
        expect(state.wires).toHaveLength(1);
    });

    it("asks the host about normalized ports only after generic wire checks pass", () => {
        const canConnectPorts = vi.fn(() => true);
        const state = new GraphEditorState(
            {
                nodes: [CreateNode("source", "output"), CreateNode("target", "input")],
                wires: [],
                frames: [],
            },
            { canConnectPorts }
        );

        expect(state.canConnect("source-output", "source-output")).toBe(false);
        expect(state.canConnect("target-input", "source-output")).toBe(false);
        expect(canConnectPorts).not.toHaveBeenCalled();

        expect(state.canConnect("source-output", "target-input")).toBe(true);
        expect(canConnectPorts).toHaveBeenCalledExactlyOnceWith("source-output", "target-input");
    });

    it("rejects a host-incompatible wire before changing editor state", () => {
        const output = CreateNode("source", "output");
        const input = CreateNode("target", "input");
        const state = new GraphEditorState(
            { nodes: [output, input], wires: [], frames: [] },
            {
                canConnectPorts: () => false,
            }
        );
        let changes = 0;
        const observer = state.onChanged.add(() => changes++);

        expect(state.canConnect("source-output", "target-input")).toBe(false);
        expect(state.addWire("source-output", "target-input")).toBeUndefined();
        expect(state.wires).toEqual([]);
        expect(state.canUndo).toBe(false);
        expect(state.changeVersion).toBe(0);
        expect(changes).toBe(0);

        observer.remove();
    });
});
