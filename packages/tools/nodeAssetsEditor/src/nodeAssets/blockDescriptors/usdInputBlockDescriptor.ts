import { USDInputBlock } from "node-assets/Blocks/usdInputBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { ConfigureBlockForEditor, type IPropertySectionContext, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const InputHeaderColor = "#3f7d4e";
const SourceErrors = new WeakMap<USDInputBlock, string>();
const PendingSourceRequests = new WeakMap<USDInputBlock, Promise<void>>();

// eslint-disable-next-line @typescript-eslint/naming-convention
async function PromptForUSDAsync(block: USDInputBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".usd,.usda,.usdc,.usdz");
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

// eslint-disable-next-line @typescript-eslint/naming-convention
async function SetUSDUrlAsync(block: USDInputBlock, url: string, context: IPropertySectionContext): Promise<void> {
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
 * Builds the source controls shared by the USD input block and Import USD.
 * @param block The owned USD input primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function CreateUSDInputPropertySection(block: USDInputBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                    void SetUSDUrlAsync(block, value, context);
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
                label: "Upload USD\u2026",
                onClick: () => {
                    void PromptForUSDAsync(block, context);
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
    paletteItemId: "usd-input",
    label: "USD",
    description: "Read a URL or uploaded USD source.",
    keywords: ["read", "open", "load", "url", "upload", "usd", "usdz", "input", "source"],
    category: InputsCategory,
    headerColor: InputHeaderColor,
    className: USDInputBlock.ClassName,
    abstractedBy: "import-usd",
    create: (nodeAsset) => ConfigureBlockForEditor(new USDInputBlock("USD", nodeAsset)),
    getPropertySection: (block, context) => CreateUSDInputPropertySection(block as USDInputBlock, context),
});
