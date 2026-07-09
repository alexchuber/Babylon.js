import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

// Data-driven node header color for the import boundary block.
const ImportHeaderColor = "#3f7d4e";

/**
 * Prompts for a source glTF file and stores its bytes on the block, then refreshes the property pane
 * so its status line updates.
 * @param block - The glTF import block to populate.
 * @param refresh - Re-renders the property pane after the async pick resolves.
 */
async function PromptForGLTFAsync(block: ImportGLTFBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".glb,.gltf");
    if (!file) {
        return;
    }
    block.data = new Uint8Array(await file.arrayBuffer());
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    category: "Sources",
    headerColor: ImportHeaderColor,
    className: ImportGLTFBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFBlock("Import glTF", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportGLTFBlock;
        const status = importBlock.data ? `Loaded (${importBlock.data.length} bytes)` : "No file loaded";
        return {
            title: "IMPORT",
            properties: [
                { kind: "text", label: "Source", value: status, onChange: () => undefined },
                {
                    kind: "button",
                    label: "Import glTF file\u2026",
                    onClick: () => {
                        void PromptForGLTFAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
