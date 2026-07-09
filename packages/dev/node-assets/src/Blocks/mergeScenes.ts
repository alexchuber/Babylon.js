import { type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";

/** The number of SCENE inputs a freshly created MergeScenes block starts with. */
const DefaultInputCount = 2;

/**
 * A composition block that folds several SCENE inputs into one combined SCENE, wrapping
 * `@gltf-transform/functions`' `mergeDocuments`. Each connected input `Document` is folded, in port
 * order, into a fresh target `Document`; the sources are copied, never mutated. The merged scenes are
 * then combined under a single scene (`/scenes/0`) so every source's node hierarchy stays addressable
 * via `/nodes/i/*` and the whole assembly is visible on export, and the per-source buffers are
 * consolidated so the result is a valid single-buffer glb.
 *
 * The input set is variadic: a block starts with {@link DefaultInputCount} inputs and grows via
 * {@link addInput} as more parts are wired in, so composition scales with content. No cross-source
 * dedup/instancing is performed here; run a {@link DedupBlock} afterwards for that.
 */
export class MergeScenes extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "MergeScenes";

    /** The combined `Document` folding every connected input scene into one. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new merge-scenes block with {@link DefaultInputCount} SCENE inputs and one SCENE output.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);
        for (let index = 0; index < DefaultInputCount; index++) {
            this.addInput();
        }
    }

    /**
     * Appends one more SCENE input to the variadic input set. Inputs are named `input0`, `input1`, …
     * so their wiring survives {@link serialize}/{@link NodeAsset.Parse} by point name.
     * @returns The newly created input connection point.
     */
    public addInput(): NodeAssetConnectionPoint {
        return this._registerInput(`input${this.inputs.length}`, NodeAssetConnectionPointType.SCENE);
    }

    /**
     * Folds every connected input `Document` into a fresh target via `mergeDocuments`, combines the
     * resulting scenes into one, consolidates buffers, and sets the target as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const { Document } = await import("@gltf-transform/core");
        const { mergeDocuments, unpartition } = await import("@gltf-transform/functions");

        const target = new Document();
        for (const input of this.inputs) {
            const source = input.value as Nullable<Document>;
            // Tolerate an unwired/empty input so partial graphs still produce a (possibly empty) scene.
            if (!source) {
                continue;
            }
            // Folds source INTO target without mutating source, so fan-out isolation is not needed here.
            mergeDocuments(target, source);
        }

        const root = target.getRoot();

        // mergeDocuments keeps each source's scene(s) separate and does not copy the source roots'
        // default-scene pointer, so combine every scene under the first and mark it the default. This
        // makes /scenes/0 the single combined assembly and gives the exported glb a `scene` (a glTF
        // viewer renders only the default scene; without this, strict consumers may render nothing).
        const scenes = root.listScenes();
        if (scenes.length > 0) {
            const combined = scenes[0];
            for (let index = 1; index < scenes.length; index++) {
                const scene = scenes[index];
                for (const child of scene.listChildren()) {
                    combined.addChild(child);
                }
                scene.dispose();
            }
            root.setDefaultScene(combined);
        }

        // mergeDocuments also keeps each source's buffer; a glb allows only one, so consolidate them.
        if (root.listBuffers().length > 1) {
            await target.transform(unpartition());
        }

        this.output.value = target;
    }

    /**
     * Serializes this block's variadic input count so a saved N-input merge reloads with N inputs.
     * @returns The serialization object.
     */
    public override serialize(): any {
        const serializationObject = super.serialize();
        serializationObject.inputCount = this.inputs.length;
        return serializationObject;
    }

    /**
     * Restores this block's variadic input count, growing the input set to match the saved graph so
     * its wiring reconnects by point name.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: any): void {
        super._deserialize(serializationObject);
        const inputCount = serializationObject.inputCount ?? DefaultInputCount;
        while (this.inputs.length < inputCount) {
            this.addInput();
        }
    }
}

RegisterBlock(MergeScenes.ClassName, (name, nodeAsset) => new MergeScenes(name, nodeAsset));
