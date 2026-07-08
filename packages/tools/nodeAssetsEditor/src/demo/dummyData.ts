/**
 * Dummy data for the demo application. This is the ONLY place hardcoded node/wire/frame/palette data
 * lives; the framework itself is agnostic and receives this via the editor context. In a real host,
 * this module would be replaced by adapters over actual assets.
 */

import { type IGraphNode, type IGraphSnapshot } from "../nodeGraph/graphModel";
import { type IPaletteCategory } from "../nodeGraph/paletteModel";

// Data-driven port type colors (applied inline as visual data, not theme chrome).
const FloatColor = "#7dce2b";
const ColorColor = "#f5a623";
const VectorColor = "#4a90e2";

// Data-driven node header colors.
const InputHeader = "#5b8c5a";
const MathHeader = "#7a5c9e";
const OutputHeader = "#a94442";

/**
 * Builds the initial demo graph: a handful of connected nodes plus a frame grouping the math nodes.
 * @returns A snapshot suitable for seeding a GraphEditorState.
 */
export function CreateDummyGraph(): IGraphSnapshot {
    const nodes: IGraphNode[] = [
        {
            id: "seed-time",
            title: "Time",
            headerColor: InputHeader,
            position: { x: 80, y: 160 },
            collapsed: false,
            ports: [{ id: "seed-time-out", name: "output", direction: "output", color: FloatColor }],
        },
        {
            id: "seed-color",
            title: "Color",
            headerColor: InputHeader,
            position: { x: 80, y: 320 },
            collapsed: false,
            ports: [{ id: "seed-color-out", name: "color", direction: "output", color: ColorColor }],
        },
        {
            id: "seed-multiply",
            title: "Multiply",
            headerColor: MathHeader,
            position: { x: 400, y: 180 },
            collapsed: false,
            ports: [
                { id: "seed-multiply-a", name: "left", direction: "input", color: FloatColor },
                { id: "seed-multiply-b", name: "right", direction: "input", color: FloatColor },
                { id: "seed-multiply-out", name: "output", direction: "output", color: FloatColor },
            ],
        },
        {
            id: "seed-lerp",
            title: "Lerp",
            headerColor: MathHeader,
            position: { x: 400, y: 360 },
            collapsed: false,
            ports: [
                { id: "seed-lerp-a", name: "a", direction: "input", color: ColorColor },
                { id: "seed-lerp-b", name: "b", direction: "input", color: ColorColor },
                { id: "seed-lerp-t", name: "gradient", direction: "input", color: FloatColor },
                { id: "seed-lerp-out", name: "output", direction: "output", color: ColorColor },
            ],
        },
        {
            id: "seed-output",
            title: "Fragment Output",
            headerColor: OutputHeader,
            position: { x: 740, y: 300 },
            collapsed: false,
            ports: [{ id: "seed-output-rgba", name: "rgba", direction: "input", color: ColorColor }],
        },
    ];

    const wires = [
        { id: "seed-wire-1", fromPortId: "seed-time-out", toPortId: "seed-multiply-a" },
        { id: "seed-wire-2", fromPortId: "seed-color-out", toPortId: "seed-lerp-a" },
        { id: "seed-wire-3", fromPortId: "seed-multiply-out", toPortId: "seed-lerp-t" },
        { id: "seed-wire-4", fromPortId: "seed-lerp-out", toPortId: "seed-output-rgba" },
    ];

    const frames = [
        {
            id: "seed-frame-math",
            label: "Math",
            color: "#3a6ea5",
            position: { x: 360, y: 120 },
            size: { width: 260, height: 380 },
            nodeIds: ["seed-multiply", "seed-lerp"],
            collapsed: false,
        },
    ];

    return { nodes, wires, frames };
}

/**
 * The palette contents shown in the left pane.
 */
export const DummyPaletteCategories: readonly IPaletteCategory[] = [
    {
        label: "Inputs",
        items: [
            { id: "input-time", label: "Time" },
            { id: "input-color", label: "Color" },
            { id: "input-float", label: "Float" },
            { id: "input-vector2", label: "Vector2" },
            { id: "input-texture", label: "Texture" },
        ],
    },
    {
        label: "Math",
        items: [
            { id: "math-add", label: "Add" },
            { id: "math-subtract", label: "Subtract" },
            { id: "math-multiply", label: "Multiply" },
            { id: "math-lerp", label: "Lerp" },
            { id: "math-clamp", label: "Clamp" },
        ],
    },
    {
        label: "Outputs",
        items: [
            { id: "output-fragment", label: "Fragment Output" },
            { id: "output-vertex", label: "Vertex Output" },
        ],
    },
];

// Templates describing what each palette item becomes when dropped, keyed by palette item id.
type NodeTemplate = {
    readonly title: string;
    readonly headerColor: string;
    readonly ports: readonly { readonly name: string; readonly direction: "input" | "output"; readonly color: string }[];
};

const NodeTemplates = new Map<string, NodeTemplate>([
    ["input-time", { title: "Time", headerColor: InputHeader, ports: [{ name: "output", direction: "output", color: FloatColor }] }],
    ["input-color", { title: "Color", headerColor: InputHeader, ports: [{ name: "color", direction: "output", color: ColorColor }] }],
    ["input-float", { title: "Float", headerColor: InputHeader, ports: [{ name: "output", direction: "output", color: FloatColor }] }],
    ["input-vector2", { title: "Vector2", headerColor: InputHeader, ports: [{ name: "output", direction: "output", color: VectorColor }] }],
    ["input-texture", { title: "Texture", headerColor: InputHeader, ports: [{ name: "rgba", direction: "output", color: ColorColor }] }],
    [
        "math-add",
        {
            title: "Add",
            headerColor: MathHeader,
            ports: [
                { name: "left", direction: "input", color: FloatColor },
                { name: "right", direction: "input", color: FloatColor },
                { name: "output", direction: "output", color: FloatColor },
            ],
        },
    ],
    [
        "math-subtract",
        {
            title: "Subtract",
            headerColor: MathHeader,
            ports: [
                { name: "left", direction: "input", color: FloatColor },
                { name: "right", direction: "input", color: FloatColor },
                { name: "output", direction: "output", color: FloatColor },
            ],
        },
    ],
    [
        "math-multiply",
        {
            title: "Multiply",
            headerColor: MathHeader,
            ports: [
                { name: "left", direction: "input", color: FloatColor },
                { name: "right", direction: "input", color: FloatColor },
                { name: "output", direction: "output", color: FloatColor },
            ],
        },
    ],
    [
        "math-lerp",
        {
            title: "Lerp",
            headerColor: MathHeader,
            ports: [
                { name: "a", direction: "input", color: ColorColor },
                { name: "b", direction: "input", color: ColorColor },
                { name: "gradient", direction: "input", color: FloatColor },
                { name: "output", direction: "output", color: ColorColor },
            ],
        },
    ],
    [
        "math-clamp",
        {
            title: "Clamp",
            headerColor: MathHeader,
            ports: [
                { name: "value", direction: "input", color: FloatColor },
                { name: "output", direction: "output", color: FloatColor },
            ],
        },
    ],
    ["output-fragment", { title: "Fragment Output", headerColor: OutputHeader, ports: [{ name: "rgba", direction: "input", color: ColorColor }] }],
    ["output-vertex", { title: "Vertex Output", headerColor: OutputHeader, ports: [{ name: "position", direction: "input", color: VectorColor }] }],
]);

/**
 * Creates a demo node for a dropped palette item. Ids are generated by the store; here we only shape
 * the node template, letting the caller assign ids.
 * @param paletteItemId The id of the dropped palette item.
 * @param position The graph-space position where the node should appear.
 * @param generateId A unique-id generator (typically GraphEditorState.generateId).
 * @returns A new node, or a generic fallback node for unknown items.
 */
export function CreateNodeFromPaletteItem(paletteItemId: string, position: { x: number; y: number }, generateId: (prefix: string) => string): IGraphNode {
    const template = NodeTemplates.get(paletteItemId) ?? {
        title: "Node",
        headerColor: MathHeader,
        ports: [{ name: "output", direction: "output" as const, color: FloatColor }],
    };
    return {
        id: generateId("node"),
        title: template.title,
        headerColor: template.headerColor,
        position,
        collapsed: false,
        ports: template.ports.map((port) => ({ id: generateId("port"), name: port.name, direction: port.direction, color: port.color })),
    };
}
