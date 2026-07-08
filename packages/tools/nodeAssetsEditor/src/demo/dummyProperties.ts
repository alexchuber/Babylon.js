/**
 * Builds the demo properties pane content for a selected node. Lives in the demo layer because the
 * meaning of a node's properties is host-specific; the framework only knows how to render the
 * resulting descriptors. Edits are written straight back to the store so the canvas updates live.
 */

import { type IGraphNode } from "../nodeGraph/graphModel";
import { type IPropertySection } from "../nodeGraph/propertyModel";
import { type GraphEditorState } from "../nodeGraph/editorState";

// Header color presets offered by the "Header preset" dropdown.
const HeaderPresets = new Map<string, string>([
    ["Input", "#5b8c5a"],
    ["Math", "#7a5c9e"],
    ["Output", "#a94442"],
]);

function PresetNameForColor(color: string): string {
    for (const [name, value] of HeaderPresets) {
        if (value.toLowerCase() === color.toLowerCase()) {
            return name;
        }
    }
    return "Custom";
}

/**
 * Creates a property-section builder bound to a specific editor state.
 * @param state The editor state edits should be written to.
 * @returns A function that builds the property sections for a given node.
 */
export function CreateBuildPropertySections(state: GraphEditorState): (node: IGraphNode) => readonly IPropertySection[] {
    return (node: IGraphNode): readonly IPropertySection[] => {
        return [
            {
                title: "GENERAL",
                properties: [
                    {
                        kind: "text",
                        label: "Name",
                        value: node.title,
                        onChange: (value) => {
                            node.title = value;
                            state.notifyChanged();
                        },
                    },
                    {
                        kind: "dropdown",
                        label: "Header preset",
                        value: PresetNameForColor(node.headerColor),
                        options: ["Input", "Math", "Output"],
                        onChange: (value) => {
                            const preset = HeaderPresets.get(value);
                            if (preset) {
                                node.headerColor = preset;
                                state.notifyChanged();
                            }
                        },
                    },
                    {
                        kind: "color",
                        label: "Header color",
                        value: node.headerColor,
                        onChange: (value) => {
                            node.headerColor = value;
                            state.notifyChanged();
                        },
                    },
                ],
            },
            {
                title: "TRANSFORM",
                properties: [
                    {
                        kind: "slider",
                        label: "Position X",
                        value: Math.round(node.position.x),
                        min: -200,
                        max: 1200,
                        step: 1,
                        onChange: (value) => {
                            node.position = { x: value, y: node.position.y };
                            state.notifyChanged();
                        },
                    },
                    {
                        kind: "slider",
                        label: "Position Y",
                        value: Math.round(node.position.y),
                        min: -200,
                        max: 1200,
                        step: 1,
                        onChange: (value) => {
                            node.position = { x: node.position.x, y: value };
                            state.notifyChanged();
                        },
                    },
                    {
                        kind: "button",
                        label: "Reset position",
                        onClick: () => {
                            node.position = { x: 0, y: 0 };
                            state.notifyChanged();
                        },
                    },
                ],
            },
            {
                title: "APPEARANCE",
                collapseByDefault: true,
                properties: [
                    {
                        kind: "switch",
                        label: "Collapsed",
                        value: node.collapsed,
                        onChange: (value) => {
                            state.setNodeCollapsed(node.id, value);
                        },
                    },
                ],
            },
        ];
    };
}
