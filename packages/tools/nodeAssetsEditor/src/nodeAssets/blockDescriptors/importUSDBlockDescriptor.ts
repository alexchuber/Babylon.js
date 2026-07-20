import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";

import { ConfigureBlockForEditor, InputsCategory, InputsHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

/**
 * Prompts for a source USD file and stores its bytes on the block, then refreshes the property pane
 * so its status line updates.
 * @param block - The USD import block to populate.
 * @param refresh - Re-renders the property pane after the async pick resolves.
 */
async function PromptForUsdAsync(block: ImportUSDBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".usd,.usda,.usdc,.usdz");
    if (!file) {
        return;
    }
    block.data = new Uint8Array(await file.arrayBuffer());
    block.source = file.name;
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "import-usd",
    label: "USD",
    description: "Transcode a USD, USDA, or USDZ source onto the scene spine.",
    keywords: ["import", "open", "load", "source", "Pixar", "USDZ"],
    category: InputsCategory,
    headerColor: InputsHeaderColor,
    className: ImportUSDBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportUSDBlock("USD", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportUSDBlock;
        // Show where the bytes came from (the source URL or the uploaded file name); fall back to a byte
        // count for graphs saved before a source label was recorded.
        const status = importBlock.data ? (importBlock.source ?? `Loaded (${importBlock.data.length} bytes)`) : "No file loaded";
        return {
            title: "IMPORT",
            properties: [
                { kind: "text", label: "Source", value: status, onChange: () => undefined },
                {
                    kind: "button",
                    label: "Import USD file\u2026",
                    onClick: () => {
                        void PromptForUsdAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
