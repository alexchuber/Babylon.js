import { ReadBabylonBlock } from "node-assets/Blocks/readBabylonBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";
import { BabylonHeaderColor, ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";

const SourceErrors = new WeakMap<ReadBabylonBlock, string>();
const PendingSourceRequests = new WeakMap<ReadBabylonBlock, Promise<unknown>>();

async function PromptForBabylonAsync(block: ReadBabylonBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".babylon");
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

async function SetBabylonUrlAsync(block: ReadBabylonBlock, url: string, context: IPropertySectionContext): Promise<void> {
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
 * Builds the source controls shared by Read Babylon and Import Babylon.
 * @param block The owned Read Babylon primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateReadBabylonPropertySection(block: ReadBabylonBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                    void SetBabylonUrlAsync(block, value, context);
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
                label: "Upload Babylon\u2026",
                onClick: () => {
                    void PromptForBabylonAsync(block, context);
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
    paletteItemId: "read-babylon",
    label: "Read Babylon",
    description: "Read a URL or uploaded .babylon source.",
    category: "Inputs",
    headerColor: BabylonHeaderColor,
    className: ReadBabylonBlock.ClassName,
    abstractedBy: "import-babylon",
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadBabylonBlock("Read Babylon", nodeAsset)),
    getPropertySection: (block, context) => CreateReadBabylonPropertySection(block as ReadBabylonBlock, context),
});
