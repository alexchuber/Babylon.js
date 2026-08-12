import { ImportBabylonBlock } from "node-assets/Blocks/importBabylonBlock";

import { ConfigureBlockForEditor, InputHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

async function PromptForBabylonFileAsync(block: ImportBabylonBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".babylon");
    if (!file) {
        return;
    }
    block.url.value = URL.createObjectURL(file);
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "legacy-import-babylon",
    label: "Legacy Import Babylon",
    category: ImportersCategory,
    description: "Load a legacy .babylon scene representation.",
    keywords: ["babylon", ".babylon", "scene", "load"],
    headerColor: InputHeaderColor,
    className: ImportBabylonBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonBlock("Legacy Import Babylon", nodeAsset)),
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
