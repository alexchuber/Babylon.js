import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";
import { PromptForFileAsync } from "../browserFiles";

async function PromptForLegacyGLTFAsync(block: ImportGLTFBlock, refresh: () => void): Promise<void> {
    const file = await PromptForFileAsync(".glb,.gltf");
    if (!file) {
        return;
    }
    block.data = new Uint8Array(await file.arrayBuffer());
    block.source = file.name;
    refresh();
}

RegisterBlockDescriptor({
    paletteItemId: "legacy-import-gltf",
    label: "Import glTF",
    description: "Legacy direct glTF import retained for saved-graph compatibility.",
    category: "Inputs",
    headerColor: "#3f7d4e",
    className: ImportGLTFBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFBlock("Import glTF", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportGLTFBlock;
        return {
            title: "IMPORT",
            properties: [
                {
                    kind: "text",
                    label: "Source",
                    value: importBlock.source ?? "No file loaded",
                    disabled: true,
                    onChange: () => undefined,
                },
                {
                    kind: "button",
                    label: "Import glTF file\u2026",
                    onClick: () => {
                        void PromptForLegacyGLTFAsync(importBlock, refresh);
                    },
                },
            ],
        };
    },
});
