import { OBJInputBlock } from "node-assets/Blocks/objInputBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFilesAsync } from "../browserFiles";
import { ConfigureBlockForEditor, type IPropertySectionContext, InputHeaderColor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";

const SourceErrors = new WeakMap<OBJInputBlock, string>();
const PendingSourceRequests = new WeakMap<OBJInputBlock, Promise<unknown>>();

// eslint-disable-next-line @typescript-eslint/naming-convention
async function PromptForOBJAsync(block: OBJInputBlock, context: IPropertySectionContext): Promise<void> {
    const files = await PromptForFilesAsync(".obj,.mtl,.jpg,.jpeg,.png,.webp,.avif,.ktx2");
    if (files === null) {
        return;
    }
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const applyResult = { applied: false };
    const request = authoredBlock.setUploadedSourceBundleAsync(
        async () =>
            await Promise.all(
                files.map(async ({ file, path }) => ({
                    path,
                    bytes: new Uint8Array(await file.arrayBuffer()),
                }))
            ),
        () => context.prepareEdit(authoredBlock) === authoredBlock,
        applyResult
    );
    PendingSourceRequests.set(authoredBlock, request);
    try {
        await request;
        if (context.prepareEdit(authoredBlock) === authoredBlock && applyResult.applied) {
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

// eslint-disable-next-line @typescript-eslint/naming-convention
async function SetOBJUrlAsync(block: OBJInputBlock, url: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const applyResult = { applied: false };
    const request = authoredBlock.setUrlAsync(url, undefined, () => context.prepareEdit(authoredBlock) === authoredBlock, applyResult);
    PendingSourceRequests.set(authoredBlock, request);
    try {
        await request;
        if (context.prepareEdit(authoredBlock) === authoredBlock && applyResult.applied) {
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
 * Builds the source controls shared by the OBJ input block and Import OBJ.
 * @param block The owned OBJ input primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function CreateOBJInputPropertySection(block: OBJInputBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                    void SetOBJUrlAsync(block, value, context);
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
                label: "Upload OBJ\u2026",
                onClick: () => {
                    void PromptForOBJAsync(block, context);
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
    paletteItemId: "obj-input",
    label: "OBJ",
    description: "Read a URL or one uploaded OBJ bundle.",
    keywords: ["read", "open", "load", "url", "upload", "obj", "mtl", "input", "source"],
    category: InputsCategory,
    headerColor: InputHeaderColor,
    className: OBJInputBlock.ClassName,
    abstractedBy: "import-obj",
    create: (nodeAsset) => ConfigureBlockForEditor(new OBJInputBlock("OBJ", nodeAsset)),
    getPropertySection: (block, context) => CreateOBJInputPropertySection(block as OBJInputBlock, context),
});
