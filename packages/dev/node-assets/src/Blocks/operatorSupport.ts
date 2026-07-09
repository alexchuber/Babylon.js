import { type Document, type Transform } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";

/**
 * Reads an operator block's required input `Document`, applies the given gltf-transform operations to
 * it in place, and writes the same `Document` to the block's output. This is the trivial boilerplate
 * shared by every SCENE→SCENE operator block, so each block only has to dynamic-`import` its op and
 * pass the configured transform(s). It is a helper, not an operator base class: blocks do not extend
 * it, and each keeps its own params, serialization, and registration.
 *
 * The document is mutated in place (fan-out correctness is deferred to a later slice), matching the
 * other middle blocks.
 * @param block - The operator block, which must expose a single SCENE `input` and `output`.
 * @param transforms - The gltf-transform operations to apply to the document, in order.
 */
export async function ApplyOperatorTransformsAsync(
    block: NodeAssetBlock & { readonly input: NodeAssetConnectionPoint; readonly output: NodeAssetConnectionPoint },
    ...transforms: Transform[]
): Promise<void> {
    const { input, output } = block;
    const document = input.value as Nullable<Document>;
    if (!document) {
        throw new Error(`The "${block.name}" operator block has no input document.`);
    }

    await document.transform(...transforms);

    output.value = document;
}
