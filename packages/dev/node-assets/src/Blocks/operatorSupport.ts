import { type Transform } from "@gltf-transform/core";

import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { GetGltfAsset } from "../representations/gltfAsset";

/**
 * Reads an operator block's required {@link GltfAsset}, applies the given gltf-transform operations to
 * its document in place, and writes the same asset to the block's output. This is the trivial boilerplate
 * shared by document-backed glTF and Universal operators, so each block only has to dynamic-`import`
 * its operation and pass the configured transform(s). It is a helper, not an operator base class:
 * blocks do not extend it, and each keeps its own parameters, serialization, and registration.
 *
 * The document is mutated in place; the evaluator isolates fanned-out consumers before this helper
 * runs, matching the other middle blocks.
 * @param block - The operator block, which must expose one compatible document-backed `input` and `output`.
 * @param transforms - The gltf-transform operations to apply to the document, in order.
 */
export async function ApplyOperatorTransformsAsync(
    block: NodeAssetBlock & { readonly input: NodeAssetConnectionPoint; readonly output: NodeAssetConnectionPoint },
    ...transforms: Transform[]
): Promise<void> {
    await ApplyGltfDocumentTransformsAsync(block, "operator", transforms);
}

/**
 * Applies gltf-transform operations to the Universal payload carried by a Universal operator block.
 * @param block The Universal operator block.
 * @param transforms The gltf-transform operations to apply, in order.
 */
export async function ApplyUniversalOperatorTransformsAsync(
    block: NodeAssetBlock & { readonly input: NodeAssetConnectionPoint; readonly output: NodeAssetConnectionPoint },
    ...transforms: Transform[]
): Promise<void> {
    await ApplyGltfDocumentTransformsAsync(block, "Universal operator", transforms);
}

async function ApplyGltfDocumentTransformsAsync(
    block: NodeAssetBlock & { readonly input: NodeAssetConnectionPoint; readonly output: NodeAssetConnectionPoint },
    blockKind: string,
    transforms: Transform[]
): Promise<void> {
    const { input, output } = block;
    if (input.value == null) {
        throw new Error(`The "${block.name}" ${blockKind} block has no input document.`);
    }
    const asset = GetGltfAsset(input.value, input.name);

    await asset.document.transform(...transforms);

    output.value = asset;
}
