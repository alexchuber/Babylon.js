import { FBXInputBlock } from "node-assets/Blocks/fbxInputBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { FBXHeaderColor, ConfigureBlockForEditor, type IPropertySectionContext, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const SourceErrors = new WeakMap<FBXInputBlock, string>();
const PendingSourceRequests = new WeakMap<FBXInputBlock, Promise<unknown>>();

async function PromptForFBXAsync(block: FBXInputBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".fbx");
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

// eslint-disable-next-line @typescript-eslint/naming-convention
async function SetFBXUrlAsync(block: FBXInputBlock, url: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const applyResult = { applied: false };
    const request = authoredBlock.setUrlAsync(
        url,
        undefined,
        () => context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request,
        applyResult
    );
    PendingSourceRequests.set(authoredBlock, request);
    try {
        await request;
        if (context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request && applyResult.applied) {
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
 * Builds the source controls shared by the FBX input block and Import FBX.
 * @param block The owned FBX input primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateFBXInputPropertySection(block: FBXInputBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                    void SetFBXUrlAsync(block, value, context);
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
                label: "Upload FBX\u2026",
                onClick: () => {
                    void PromptForFBXAsync(block, context);
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
    paletteItemId: "fbx-input",
    label: "FBX",
    description: "Read a URL or uploaded .fbx source.",
    keywords: ["read", "open", "load", "url", "upload", "fbx", "input", "source"],
    category: InputsCategory,
    headerColor: FBXHeaderColor,
    className: FBXInputBlock.ClassName,
    abstractedBy: "import-fbx",
    create: (nodeAsset) => ConfigureBlockForEditor(new FBXInputBlock("FBX", nodeAsset)),
    getPropertySection: (block, context) => CreateFBXInputPropertySection(block as FBXInputBlock, context),
});
