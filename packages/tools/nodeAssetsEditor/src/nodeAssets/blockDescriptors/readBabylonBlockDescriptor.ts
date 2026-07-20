import { ReadBabylonBlock } from "node-assets/Blocks/readBabylonBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";
import { BabylonHeaderColor, ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";

const SourceErrors = new WeakMap<ReadBabylonBlock, string>();

async function PromptForBabylonAsync(block: ReadBabylonBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".babylon");
    if (!file) {
        return;
    }
    block.setUploadedSource(new Uint8Array(await file.arrayBuffer()), file.name);
    SourceErrors.delete(block);
    refresh();
}

async function SetBabylonUrlAsync(block: ReadBabylonBlock, url: string, refresh: () => void): Promise<void> {
    try {
        await block.setUrlAsync(url);
        SourceErrors.delete(block);
    } catch (error) {
        SourceErrors.set(block, error instanceof Error ? error.message : String(error));
    }
    refresh();
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
                        block.clearSource();
                        SourceErrors.delete(block);
                        context.refresh();
                        return;
                    }
                    void SetBabylonUrlAsync(block, value, context.refresh);
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
                    void PromptForBabylonAsync(block, context.refresh);
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
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadBabylonBlock("Read Babylon", nodeAsset)),
    getPropertySection: (block, context) => CreateReadBabylonPropertySection(block as ReadBabylonBlock, context),
});
