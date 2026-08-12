import { NodeGeometryInputBlock } from "node-assets/Blocks/nodeGeometryInputBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { ConfigureBlockForEditor, type IPropertySectionContext, InputHeaderColor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const SourceErrors = new WeakMap<NodeGeometryInputBlock, string>();
const PendingSourceRequests = new WeakMap<NodeGeometryInputBlock, Promise<unknown>>();

async function PromptForNodeGeometryAsync(block: NodeGeometryInputBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync("application/json,.json");
    if (!file) {
        return;
    }
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const request = file.arrayBuffer();
    PendingSourceRequests.set(authoredBlock, request);
    try {
        const data = new Uint8Array(await request);
        if (context.prepareEdit(authoredBlock) !== authoredBlock || PendingSourceRequests.get(authoredBlock) !== request) {
            return;
        }
        await authoredBlock.setUploadedSourceAsync(data, file.name);
        SourceErrors.delete(authoredBlock);
    } catch (error) {
        if (context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request) {
            SourceErrors.set(authoredBlock, error instanceof Error ? error.message : String(error));
        }
    } finally {
        if (PendingSourceRequests.get(authoredBlock) === request) {
            PendingSourceRequests.delete(authoredBlock);
        }
    }
    if (context.prepareEdit(authoredBlock) === authoredBlock) {
        context.refresh();
    }
}

async function SetSnippetIdAsync(block: NodeGeometryInputBlock, snippetId: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const request = authoredBlock.setSnippetIdAsync(snippetId, undefined, () => context.prepareEdit(authoredBlock) === authoredBlock);
    PendingSourceRequests.set(authoredBlock, request);
    try {
        await request;
        if (context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request) {
            SourceErrors.delete(authoredBlock);
        }
    } catch (error) {
        if (context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request) {
            SourceErrors.set(authoredBlock, error instanceof Error ? error.message : String(error));
        }
    } finally {
        if (PendingSourceRequests.get(authoredBlock) === request) {
            PendingSourceRequests.delete(authoredBlock);
        }
    }
    if (context.prepareEdit(authoredBlock) === authoredBlock) {
        context.refresh();
    }
}

/**
 * Builds the source controls shared by the Node Geometry input block and Import Node Geometry.
 * @param block The owned Node Geometry input primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateNodeGeometryInputPropertySection(block: NodeGeometryInputBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
    const sourceError = SourceErrors.get(block);
    return {
        title,
        properties: [
            {
                kind: "text",
                label: "Snippet ID",
                value: block.sourceKind === "snippet" ? `#${block.source ?? ""}` : "",
                validateOnlyOnBlur: true,
                onChange: (value) => {
                    if (!value) {
                        const authoredBlock = context.prepareEdit(block);
                        if (!authoredBlock) {
                            return;
                        }
                        authoredBlock.clearSource();
                        PendingSourceRequests.delete(authoredBlock);
                        SourceErrors.delete(authoredBlock);
                        context.refresh();
                        return;
                    }
                    void SetSnippetIdAsync(block, value, context);
                },
            },
            {
                kind: "text",
                label: "Active source",
                value: block.source ?? "No source loaded",
                disabled: true,
                onChange: () => undefined,
            },
            {
                kind: "button",
                label: "Upload Node Geometry\u2026",
                onClick: () => {
                    void PromptForNodeGeometryAsync(block, context);
                },
            },
            ...(sourceError
                ? ([
                      {
                          kind: "text",
                          label: "Source error",
                          value: sourceError,
                          disabled: true,
                          onChange: () => undefined,
                      },
                  ] as const)
                : []),
        ],
    };
}

RegisterBlockDescriptor({
    paletteItemId: "node-geometry-input",
    label: "Node Geometry",
    description: "Resolve a snippet ID or uploaded serialized Node Geometry graph.",
    keywords: ["read", "open", "load", "snippet", "upload", "node geometry", "nge", "input", "source"],
    category: InputsCategory,
    headerColor: InputHeaderColor,
    className: NodeGeometryInputBlock.ClassName,
    abstractedBy: "import-node-geometry",
    create: (nodeAsset) => ConfigureBlockForEditor(new NodeGeometryInputBlock("Node Geometry", nodeAsset)),
    getPropertySection: (block, context) => CreateNodeGeometryInputPropertySection(block as NodeGeometryInputBlock, context),
});
