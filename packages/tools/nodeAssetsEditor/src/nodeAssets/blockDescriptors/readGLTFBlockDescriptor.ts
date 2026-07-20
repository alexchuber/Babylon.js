import { ReadGLTFBlock } from "node-assets/Blocks/readGLTFBlock";

import { ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";

const ReadHeaderColor = "#3f7d4e";
const SourceErrors = new WeakMap<ReadGLTFBlock, string>();

async function PromptForGLTFAsync(block: ReadGLTFBlock, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    const file = await PromptForFileAsync(".glb,.gltf");
    if (!file) {
        return;
    }
    authoredBlock.setUploadedSource(new Uint8Array(await file.arrayBuffer()), file.name);
    SourceErrors.delete(authoredBlock);
    context.refresh();
}

async function SetGLTFUrlAsync(block: ReadGLTFBlock, url: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    try {
        await authoredBlock.setUrlAsync(url);
        SourceErrors.delete(authoredBlock);
    } catch (error) {
        SourceErrors.set(authoredBlock, error instanceof Error ? error.message : String(error));
    }
    context.refresh();
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
                        const authoredBlock = context.prepareEdit(block);
                        authoredBlock.data = null;
                        authoredBlock.source = null;
                        authoredBlock.sourceKind = null;
                        SourceErrors.delete(authoredBlock);
                        context.refresh();
                        return;
                    }
                    void SetGLTFUrlAsync(block, value, context);
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
                    void PromptForGLTFAsync(block, context);
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
    abstractedBy: "import-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadGLTFBlock("Read glTF", nodeAsset)),
    getPropertySection: (block, context) => CreateReadGLTFPropertySection(block as ReadGLTFBlock, context),
});
