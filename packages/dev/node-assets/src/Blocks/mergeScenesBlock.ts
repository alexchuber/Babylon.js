import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset, GltfAsset } from "../representations/gltfAsset";
import { GetSerializedIntegerInRange, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

const DefaultInputCount = 2;
const MaxInputCount = 256;

/** Merges variadic Universal scene inputs into one Universal scene. */
export class MergeScenesBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "MergeScenesBlock";

    /** The merged Universal asset. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Merge Scenes block with two Universal inputs.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
        for (let index = 0; index < DefaultInputCount; index++) {
            this.addInput();
        }
    }

    /**
     * Appends another optional Universal input.
     * @returns The new input connection point.
     */
    public addInput(): NodeAssetConnectionPoint {
        return this._registerInput(`input${this.inputs.length}`, NodeAssetConnectionPointType.UNIVERSAL, true);
    }

    /** Copies and merges every populated Universal input into a fresh Universal asset. */
    public override async _buildBlockAsync(): Promise<void> {
        const { Document } = await import("@gltf-transform/core");
        const { mergeDocuments, unpartition } = await import("@gltf-transform/functions");
        const target = new Document();
        const sources: GltfAsset[] = [];

        for (const input of this.inputs) {
            if (input.value == null) {
                continue;
            }
            const source = GetGltfAsset(input.value, input.name);
            sources.push(source);
            mergeDocuments(target, source.document);
        }

        const root = target.getRoot();
        const scenes = root.listScenes();
        if (scenes.length > 0) {
            const combinedScene = scenes[0];
            for (let index = 1; index < scenes.length; index++) {
                const scene = scenes[index];
                for (const child of scene.listChildren()) {
                    combinedScene.addChild(child);
                }
                scene.dispose();
            }
            root.setDefaultScene(combinedScene);
        }
        if (root.listBuffers().length > 1) {
            await target.transform(unpartition());
        }

        const sourceIdentities = sources.map((source) => source.identity);
        this.output.value = new GltfAsset(target, {
            identity: `merge:${sourceIdentities.join("|")}`,
            revision: sources.reduce((revision, source) => Math.max(revision, source.revision), 0),
            manifest: {
                format: "universal",
                mergedSources: sourceIdentities,
            },
        });
    }

    /** @returns This block's serialized input arity. */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.inputCount = this.inputs.length;
        return serializationObject;
    }

    /**
     * Restores this block's input arity before graph connections are parsed.
     * @param serializationObject The serialized block.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const inputCount = GetSerializedIntegerInRange(serializationObject, "inputCount", DefaultInputCount, MaxInputCount, DefaultInputCount);
        while (this.inputs.length < inputCount) {
            this.addInput();
        }
    }
}

RegisterBlock(MergeScenesBlock.ClassName, (name, nodeAsset) => new MergeScenesBlock(name, nodeAsset));
