import { ReadUSDBlock } from "node-assets/Blocks/readUSDBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

const ReadHeaderColor = "#3f7d4e";
const SourceErrors = new WeakMap<ReadUSDBlock, string>();
const PendingUrlRequests = new WeakMap<ReadUSDBlock, Promise<void>>();

// eslint-disable-next-line @typescript-eslint/naming-convention
async function PromptForUSDAsync(block: ReadUSDBlock, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    const file = await PromptForFileAsync(".usd,.usda,.usdc,.usdz");
    if (!file) {
        return;
    }
    authoredBlock.setUploadedSource(new Uint8Array(await file.arrayBuffer()), file.name);
    PendingUrlRequests.delete(authoredBlock);
    SourceErrors.delete(authoredBlock);
    context.refresh();
}

// eslint-disable-next-line @typescript-eslint/naming-convention
async function SetUSDUrlAsync(block: ReadUSDBlock, url: string, context: IPropertySectionContext): Promise<void> {
    const authoredBlock = context.prepareEdit(block);
    const request = authoredBlock.setUrlAsync(url);
    PendingUrlRequests.set(authoredBlock, request);
    try {
        await request;
        if (PendingUrlRequests.get(authoredBlock) === request) {
            SourceErrors.delete(authoredBlock);
        }
    } catch (error) {
        if (PendingUrlRequests.get(authoredBlock) === request) {
            SourceErrors.set(authoredBlock, error instanceof Error ? error.message : String(error));
        }
    } finally {
        if (PendingUrlRequests.get(authoredBlock) === request) {
            PendingUrlRequests.delete(authoredBlock);
        }
        context.refresh();
    }
}

/**
 * Builds the source controls shared by Read USD and Import USD.
 * @param block The owned Read USD primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function CreateReadUSDPropertySection(block: ReadUSDBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
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
                        authoredBlock.clearSource();
                        PendingUrlRequests.delete(authoredBlock);
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
    paletteItemId: "read-usd",
    label: "Read USD",
    description: "Read a URL or uploaded USD source.",
    category: "Inputs",
    headerColor: ReadHeaderColor,
    className: ReadUSDBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadUSDBlock("Read USD", nodeAsset)),
    getPropertySection: (block, context) => CreateReadUSDPropertySection(block as ReadUSDBlock, context),
});
