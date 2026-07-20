import { WriteGLTFBlock } from "node-assets/Blocks/writeGLTFBlock";

import { ConfigureBlockForEditor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";
import { type IPropertySection } from "../../nodeGraph/propertyModel";

const WriteHeaderColor = "#3a6ea5";

/**
 * Builds the output controls shared by Write glTF and Export glTF.
 * @param block The owned Write glTF primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
export function CreateWriteGLTFPropertySection(block: WriteGLTFBlock, context: IPropertySectionContext, title = "OUTPUT"): IPropertySection {
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
    paletteItemId: "write-gltf",
    label: "Write glTF",
    description: "Write the glTF delivery lane as a binary GLB.",
    category: "glTF",
    headerColor: WriteHeaderColor,
    className: WriteGLTFBlock.ClassName,
    abstractedBy: "export-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new WriteGLTFBlock("Write glTF", nodeAsset)),
    getPropertySection: (block, context) => CreateWriteGLTFPropertySection(block as WriteGLTFBlock, context),
});
