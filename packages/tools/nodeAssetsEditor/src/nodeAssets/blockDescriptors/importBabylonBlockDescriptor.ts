import { ImportBabylonBlock } from "node-assets/Blocks/importBabylonBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

// Data-driven node header color for the Babylon import block.
const ImportHeaderColor = "#3f6fd9";

/**
 * Prompts for a `.babylon` file, creates an object URL from it, and sets it on the block's
 * `url` connection point, then refreshes the property pane so the URL field updates.
 * @param block - The Babylon import block to populate.
 * @param refresh - Re-renders the property pane after the async pick resolves.
 */
async function PromptForBabylonFileAsync(block: ImportBabylonBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".babylon");
    if (!file) {
        return;
    }
    block.url.value = URL.createObjectURL(file);
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "import-babylon",
    label: "Import Babylon",
    category: "Sources",
    description: "Load a .babylon scene into a Babylon representation.",
    keywords: ["babylon", ".babylon", "scene", "load"],
    headerColor: ImportHeaderColor,
    className: ImportBabylonBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonBlock("Import Babylon", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportBabylonBlock;
        return {
            title: "IMPORT",
            properties: [
                {
                    kind: "text",
                    label: "URL",
                    value: (importBlock.url.value as string) ?? "",
                    onChange: (value: string) => {
                        importBlock.url.value = value;
                        refresh();
                    },
                },
                {
                    kind: "button",
                    label: "Import .babylon file\u2026",
                    onClick: () => {
                        void PromptForBabylonFileAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
