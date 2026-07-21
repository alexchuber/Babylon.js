import { ReadFBXBlock } from "node-assets/Blocks/readFBXBlock";

import { type IPropertySection } from "../../nodeGraph/propertyModel";
import { PromptForFileAsync } from "../browserFiles";
import { ConfigureBlockForEditor, FBXHeaderColor, type IPropertySectionContext, RegisterBlockDescriptor } from "../blockCatalog";

const SourceErrors = new WeakMap<ReadFBXBlock, string>();
const PendingSourceRequests = new WeakMap<ReadFBXBlock, Promise<ArrayBuffer>>();

// eslint-disable-next-line @typescript-eslint/naming-convention
async function PromptForFBXAsync(block: ReadFBXBlock, context: IPropertySectionContext): Promise<void> {
    const file = await PromptForFileAsync(".fbx");
    if (!file) {
        return;
    }
    const authoredBlock = context.prepareEdit(block);
    if (!authoredBlock) {
        return;
    }
    const request = file.arrayBuffer();
    PendingSourceRequests.set(authoredBlock, request);
    try {
        const data = new Uint8Array(await request);
        if (context.prepareEdit(authoredBlock) !== authoredBlock || PendingSourceRequests.get(authoredBlock) !== request) {
            return;
        }
        authoredBlock.setUploadedSource(data, file.name);
        SourceErrors.delete(authoredBlock);
    } catch (error) {
        if (context.prepareEdit(authoredBlock) === authoredBlock && PendingSourceRequests.get(authoredBlock) === request) {
            SourceErrors.set(authoredBlock, error instanceof Error ? error.message : String(error));
        }
    } finally {
        if (PendingSourceRequests.get(authoredBlock) === request) {
            PendingSourceRequests.delete(authoredBlock);
        }
    }
    if (context.prepareEdit(authoredBlock) === authoredBlock) {
        context.refresh();
    }
}

/**
 * Builds the upload controls shared by Read FBX and Import FBX.
 * @param block The owned Read FBX primitive.
 * @param context Editor property actions.
 * @param title Child-attributed section title.
 * @returns The shared property section.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function CreateReadFBXPropertySection(block: ReadFBXBlock, context: IPropertySectionContext, title = "SOURCE"): IPropertySection {
    const sourceError = SourceErrors.get(block);
    return {
        title,
        properties: [
            {
                kind: "text",
                label: "Active source",
                value: block.source ?? "No source loaded",
                disabled: true,
                onChange: () => undefined,
            },
            {
                kind: "button",
                label: "Upload FBX\u2026",
                onClick: () => {
                    void PromptForFBXAsync(block, context);
                },
            },
            ...(sourceError
                ? ([
                      {
                          kind: "text",
                          label: "Source error",
                          value: sourceError,
                          disabled: true,
                          onChange: () => undefined,
                      },
                  ] as const)
                : []),
        ],
    };
}

RegisterBlockDescriptor({
    paletteItemId: "read-fbx",
    label: "Read FBX",
    description: "Read an uploaded .fbx source.",
    category: "Inputs",
    headerColor: FBXHeaderColor,
    className: ReadFBXBlock.ClassName,
    abstractedBy: "import-fbx",
    create: (nodeAsset) => ConfigureBlockForEditor(new ReadFBXBlock("Read FBX", nodeAsset)),
    getPropertySection: (block, context) => CreateReadFBXPropertySection(block as ReadFBXBlock, context),
});
