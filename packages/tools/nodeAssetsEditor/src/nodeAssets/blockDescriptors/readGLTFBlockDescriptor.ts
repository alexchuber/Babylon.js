import { ReadGLTFBlock } from "node-assets/Blocks/readGLTFBlock";

import { ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";

const ReadHeaderColor = "#3f7d4e";
const SourceErrors = new WeakMap<ReadGLTFBlock, string>();

async function PromptForGLTFAsync(block: ReadGLTFBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".glb,.gltf");
    if (!file) {
        return;
    }
    block.setUploadedSource(new Uint8Array(await file.arrayBuffer()), file.name);
    SourceErrors.delete(block);
    refresh();
}

async function SetGLTFUrlAsync(block: ReadGLTFBlock, url: string, refresh: () => void): Promise<void> {
    try {
        await block.setUrlAsync(url);
        SourceErrors.delete(block);
    } catch (error) {
        SourceErrors.set(block, error instanceof Error ? error.message : String(error));
    }
    refresh();
}

/**
 * Builds the source controls shared by Read glTF and Import glTF.
 * @param block The owned Read glTF primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateReadGLTFPropertySection(block: ReadGLTFBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
    const sourceError = SourceErrors.get(block);
    return {
        title,
        properties: [
            {
                kind: "text",
                label: "URL",
                value: block.sourceKind === "url" ? (block.source ?? "") : "",
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
                    void SetGLTFUrlAsync(block, value, context.refresh);
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
                label: "Upload glTF\u2026",
                onClick: () => {
                    void PromptForGLTFAsync(block, context.refresh);
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
    paletteItemId: "read-gltf",
    label: "Read glTF",
    description: "Read a URL or uploaded glTF/GLB source.",
    category: "Inputs",
    headerColor: ReadHeaderColor,
    className: ReadGLTFBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadGLTFBlock("Read glTF", nodeAsset)),
    getPropertySection: (block, context) => CreateReadGLTFPropertySection(block as ReadGLTFBlock, context),
});
