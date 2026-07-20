import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";

import { ConfigureBlockForEditor, ImportsCategory, ImportsHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

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
    block.source = file.name;
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    description: "Load a glTF or GLB source scene.",
    keywords: ["open", "load", "source", "model", "GLB"],
    category: ImportsCategory,
    headerColor: ImportsHeaderColor,
    className: ImportGLTFBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFBlock("Import glTF", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportGLTFBlock;
        // Show where the bytes came from (the source URL or the uploaded file name); fall back to a byte
        // count for graphs saved before a source label was recorded.
        const status = importBlock.data ? (importBlock.source ?? `Loaded (${importBlock.data.length} bytes)`) : "No file loaded";
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
