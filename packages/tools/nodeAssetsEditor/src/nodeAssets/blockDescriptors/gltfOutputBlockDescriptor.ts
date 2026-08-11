import { GLTFOutputBlock } from "node-assets/Blocks/gltfOutputBlock";

import { ConfigureBlockForEditor, type IPropertySectionContext, OutputsCategory, RegisterBlockDescriptor } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";

const OutputHeaderColor = "#3a6ea5";

/**
 * Builds the output controls shared by the glTF output block and the Export glTF aggregate.
 * @param block The owned glTF output primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateGLTFOutputPropertySection(block: GLTFOutputBlock, context: IPropertySectionContext, title = "OUTPUT"): IPropertySection {
    return {
        title,
        properties: [
            {
                kind: "text",
                label: "File name",
                value: block.fileName,
                onChange: (value) => {
                    block.fileName = value;
                    context.refresh();
                },
            },
            {
                kind: "button",
                label: "Export .glb",
                onClick: () => context.requestExport(block.fileName),
            },
        ],
    };
}

RegisterBlockDescriptor({
    paletteItemId: "gltf-output",
    label: "glTF",
    description: "Write the glTF delivery lane as a binary GLB.",
    keywords: ["write", "save", "export", "output", "gltf", "glb"],
    category: OutputsCategory,
    headerColor: OutputHeaderColor,
    className: GLTFOutputBlock.ClassName,
    abstractedBy: "export-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new GLTFOutputBlock("glTF", nodeAsset)),
    getPropertySection: (block, context) => CreateGLTFOutputPropertySection(block as GLTFOutputBlock, context),
});
