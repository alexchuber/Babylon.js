import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";

import { ConfigureBlockForEditor, ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

/**
 * Prompts for a source image file and stores its bytes and mime type on the block, then refreshes
 * the property pane so its status line updates.
 * @param block - The image import block to populate.
 * @param refresh - Re-renders the property pane after the async pick resolves.
 */
async function PromptForImageAsync(block: ImportImageBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".png,.jpg,.jpeg,.webp,.gif,.bmp");
    if (!file) {
        return;
    }
    block.data = new Uint8Array(await file.arrayBuffer());
    // The File's type is the browser-detected mime type; fall back to the block's current one.
    block.mimeType = file.type || block.mimeType;
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "import-image",
    label: "Import Image",
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: ImportImageBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportImageBlock("Import Image", nodeAsset)),
    getPropertySection: (block, refresh) => {
        const importBlock = block as ImportImageBlock;
        const status = importBlock.data ? `Loaded (${importBlock.data.length} bytes, ${importBlock.mimeType})` : "No image loaded";
        return {
            title: "IMPORT IMAGE",
            properties: [
                { kind: "text", label: "Source", value: status, onChange: () => undefined },
                {
                    kind: "button",
                    label: "Import image file\u2026",
                    onClick: () => {
                        void PromptForImageAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
