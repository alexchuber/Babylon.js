import { ReadNodeGeometryBlock } from "node-assets/Blocks/readNodeGeometryBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const ReadHeaderColor = "#3f7d4e";
const SourceErrors = new WeakMap<ReadNodeGeometryBlock, string>();

async function PromptForNodeGeometryAsync(block: ReadNodeGeometryBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync("application/json,.json");
    if (!file) {
        return;
    }
    try {
        await block.setUploadedSourceAsync(new Uint8Array(await file.arrayBuffer()), file.name);
        SourceErrors.delete(block);
    } catch (error) {
        SourceErrors.set(block, error instanceof Error ? error.message : String(error));
    }
    refresh();
}

async function SetSnippetIdAsync(block: ReadNodeGeometryBlock, snippetId: string, refresh: () => void): Promise<void> {
    try {
        await block.setSnippetIdAsync(snippetId);
        SourceErrors.delete(block);
    } catch (error) {
        SourceErrors.set(block, error instanceof Error ? error.message : String(error));
    }
    refresh();
}

/**
 * Builds the source controls shared by Read Node Geometry and Import Node Geometry.
 * @param block The owned Read Node Geometry primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateReadNodeGeometryPropertySection(block: ReadNodeGeometryBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                        block.data = null;
                        block.source = null;
                        block.sourceKind = null;
                        SourceErrors.delete(block);
                        context.refresh();
                        return;
                    }
                    void SetSnippetIdAsync(block, value, context.refresh);
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
                    void PromptForNodeGeometryAsync(block, context.refresh);
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
    paletteItemId: "read-node-geometry",
    label: "Read Node Geometry",
    description: "Resolve a snippet ID or uploaded serialized Node Geometry graph.",
    category: "Inputs",
    headerColor: ReadHeaderColor,
    className: ReadNodeGeometryBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadNodeGeometryBlock("Read Node Geometry", nodeAsset)),
    getPropertySection: (block, context) => CreateReadNodeGeometryPropertySection(block as ReadNodeGeometryBlock, context),
});
