import { ReadFBXBlock } from "node-assets/Blocks/readFBXBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { FBXHeaderColor, ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const SourceErrors = new WeakMap<ReadFBXBlock, string>();
const PendingSourceRequests = new WeakMap<ReadFBXBlock, Promise<void>>();

async function PromptForFBXAsync(block: ReadFBXBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".fbx");
    if (!file) {
        return;
    }
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const applyResult = { applied: false };
    const request = authoredBlock.setUploadedSourceAsync(
        async () => await file.arrayBuffer(),
        file.name,
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
        if (context.prepareEdit(authoredBlock) === authoredBlock) {
            context.refresh();
        }
    }
}

async function SetFBXUrlAsync(block: ReadFBXBlock, url: string, context: IPropertySectionContext): Promise<void> {
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
        if (context.prepareEdit(authoredBlock) === authoredBlock) {
            context.refresh();
        }
    }
}

/**
 * Builds the source controls shared by Read FBX and Import FBX.
 * @param block The owned Read FBX primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateReadFBXPropertySection(block: ReadFBXBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
    paletteItemId: "read-fbx",
    label: "Read FBX",
    description: "Read a URL or uploaded .fbx source.",
    keywords: ["open", "load", "url", "upload", "fbx"],
    category: "Inputs",
    headerColor: FBXHeaderColor,
    className: ReadFBXBlock.ClassName,
    abstractedBy: "import-fbx",
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadFBXBlock("Read FBX", nodeAsset)),
    getPropertySection: (block, context) => CreateReadFBXPropertySection(block as ReadFBXBlock, context),
});
