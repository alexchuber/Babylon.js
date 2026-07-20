import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

// eslint-disable-next-line @typescript-eslint/naming-convention
async function PromptForUSDAsync(block: ImportUSDBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".usd,.usda,.usdc,.usdz");
    if (!file) {
        return;
    }
    block.data = new Uint8Array(await file.arrayBuffer());
    block.source = file.name;
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "legacy-import-usd",
    label: "Import USD (legacy)",
    description: "Legacy single-block USD importer retained for saved graph compatibility.",
    category: "Inputs",
    headerColor: "#3f7d4e",
    className: ImportUSDBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportUSDBlock("Import USD", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportUSDBlock;
        const status = importBlock.data ? (importBlock.source ?? `Loaded (${importBlock.data.length} bytes)`) : "No file loaded";
        return {
            title: "IMPORT",
            properties: [
                { kind: "text", label: "Source", value: status, disabled: true, onChange: () => undefined },
                {
                    kind: "button",
                    label: "Import USD file\u2026",
                    onClick: () => {
                        void PromptForUSDAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
