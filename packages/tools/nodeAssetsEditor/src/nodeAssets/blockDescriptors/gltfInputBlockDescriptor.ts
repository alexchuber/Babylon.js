import { GLTFInputBlock } from "node-assets/Blocks/gltfInputBlock";

import { ConfigureBlockForEditor, type IPropertySectionContext, InputHeaderColor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";

const SourceErrors = new WeakMap<GLTFInputBlock, string>();
const PendingSourceRequests = new WeakMap<GLTFInputBlock, Promise<unknown>>();

async function PromptForGLTFAsync(block: GLTFInputBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".glb,.gltf");
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
        authoredBlock.setUploadedSource(data, file.name);
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

async function SetGLTFUrlAsync(block: GLTFInputBlock, url: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const request = authoredBlock.setUrlAsync(url, undefined, () => context.prepareEdit(authoredBlock) === authoredBlock);
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
 * Builds the source controls shared by the glTF input block and Import glTF.
 * @param block The owned glTF input primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateGLTFInputPropertySection(block: GLTFInputBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                        if (!authoredBlock) {
                            return;
                        }
                        authoredBlock.clearSource();
                        PendingSourceRequests.delete(authoredBlock);
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
    paletteItemId: "gltf-input",
    label: "glTF",
    description: "Read a URL or uploaded glTF/GLB source.",
    keywords: ["read", "open", "load", "url", "upload", "gltf", "glb", "input", "source"],
    category: InputsCategory,
    headerColor: InputHeaderColor,
    className: GLTFInputBlock.ClassName,
    abstractedBy: "import-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new GLTFInputBlock("glTF", nodeAsset)),
    getPropertySection: (block, context) => CreateGLTFInputPropertySection(block as GLTFInputBlock, context),
});
