import { type Nullable } from "core/types";

import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type BuildScope } from "../evaluation/buildScope";
import { NodeAsset } from "../nodeAsset";
import { IsNodeAssetSerializedGraph, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { IsExportBlock } from "./exportBlock";
import { NodeAssetBlock } from "./nodeAssetBlock";

/** Current aggregate block serialization format. */
export const AggregateSerializationVersion = 1;

type AggregateExposure = {
    readonly publicPoint: NodeAssetConnectionPoint;
    readonly internalPoint: NodeAssetConnectionPoint;
};

type AggregateExposureSerialization = {
    readonly publicName: string;
    readonly blockId: number;
    readonly pointName: string;
};

/**
 * Base class for blocks whose behavior is an owned, typed subgraph of ordinary blocks.
 */
export abstract class AggregateBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "AggregateBlock";

    /** GLB bytes when the owned subgraph ends in a terminal block. */
    public result: Nullable<Uint8Array> = null;

    private _subgraph: NodeAsset;
    private _inputExposures: AggregateExposure[] = [];
    private _outputExposures: AggregateExposure[] = [];

    /**
     * Creates an aggregate with an empty owned subgraph.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this._subgraph = new NodeAsset(`${name} subgraph`);
    }

    /** The aggregate's owned ordinary-block subgraph. */
    public get subgraph(): NodeAsset {
        return this._subgraph;
    }

    /** Whether this aggregate's owned subgraph contains the graph terminal. */
    public get isExportTerminal(): true | undefined {
        return this._subgraph.attachedBlocks.some(IsExportBlock) && this.outputs.length === 0 ? true : undefined;
    }

    /**
     * Exposes an internal input as a public aggregate input.
     * @param internalPoint The internal connection point.
     * @param publicName The public connection point name.
     * @returns The public connection point.
     */
    protected _exposeInput(internalPoint: NodeAssetConnectionPoint, publicName = internalPoint.name): NodeAssetConnectionPoint {
        const publicPoint = this._registerInput(publicName, internalPoint.type);
        this._inputExposures.push({ publicPoint, internalPoint });
        return publicPoint;
    }

    /**
     * Exposes an internal output as a public aggregate output.
     * @param internalPoint The internal connection point.
     * @param publicName The public connection point name.
     * @returns The public connection point.
     */
    protected _exposeOutput(internalPoint: NodeAssetConnectionPoint, publicName = internalPoint.name): NodeAssetConnectionPoint {
        const publicPoint = this._registerOutput(publicName, internalPoint.type);
        this._outputExposures.push({ publicPoint, internalPoint });
        return publicPoint;
    }

    /**
     * Evaluates the aggregate's owned subgraph in the parent build scope.
     * @param scope The parent build scope.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        if (!scope) {
            throw new Error(`The "${this.name}" aggregate must be built through NodeAsset.buildAsync().`);
        }

        const externalInputs = new Set<NodeAssetConnectionPoint>();
        for (const exposure of this._inputExposures) {
            exposure.internalPoint.value = exposure.publicPoint.value;
            externalInputs.add(exposure.internalPoint);
        }

        const targets: NodeAssetBlock[] = this._subgraph.attachedBlocks.filter(IsExportBlock);
        for (const exposure of this._outputExposures) {
            if (!targets.includes(exposure.internalPoint.ownerBlock)) {
                targets.push(exposure.internalPoint.ownerBlock);
            }
        }
        if (targets.length === 0) {
            throw new Error(`The "${this.name}" aggregate has no exposed output or terminal block.`);
        }

        await this._subgraph._evaluateAggregateBlocksAsync(targets, scope, externalInputs);
        for (const exposure of this._outputExposures) {
            exposure.publicPoint.value = exposure.internalPoint.value;
        }
        const terminal = targets.find(IsExportBlock);
        this.result = terminal?.result ?? null;
    }

    /**
     * Serializes the owned subgraph and public-to-internal port mapping.
     * @returns The versioned aggregate serialization.
     */
    public override serialize(): NodeAssetBlockSerialization {
        return {
            ...super.serialize(),
            aggregateVersion: AggregateSerializationVersion,
            subgraph: this._subgraph.serialize(),
            exposedInputs: this._serializeExposures(this._inputExposures),
            exposedOutputs: this._serializeExposures(this._outputExposures),
        };
    }

    /**
     * Restores the owned subgraph and public-to-internal port mapping.
     * @param serializationObject The aggregate serialization.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        if (serializationObject.aggregateVersion !== AggregateSerializationVersion || !IsNodeAssetSerializedGraph(serializationObject.subgraph)) {
            throw new TypeError("Invalid aggregate block serialization.");
        }
        this._subgraph = NodeAsset.Parse(serializationObject.subgraph);
        this._inputExposures = this._restoreExposures(serializationObject.exposedInputs, "input");
        this._outputExposures = this._restoreExposures(serializationObject.exposedOutputs, "output");
    }

    private _serializeExposures(exposures: ReadonlyArray<AggregateExposure>): AggregateExposureSerialization[] {
        return exposures.map(({ publicPoint, internalPoint }) => ({
            publicName: publicPoint.name,
            blockId: internalPoint.ownerBlock.uniqueId,
            pointName: internalPoint.name,
        }));
    }

    private _restoreExposures(value: unknown, direction: "input" | "output"): AggregateExposure[] {
        if (!Array.isArray(value)) {
            throw new TypeError("Invalid aggregate block port exposure serialization.");
        }
        const existingPoints = direction === "input" ? this.inputs : this.outputs;
        return value.map((candidate, index) => {
            if (
                typeof candidate !== "object" ||
                candidate === null ||
                Array.isArray(candidate) ||
                typeof candidate.publicName !== "string" ||
                typeof candidate.blockId !== "number" ||
                typeof candidate.pointName !== "string"
            ) {
                throw new TypeError("Invalid aggregate block port exposure serialization.");
            }
            const block = this._subgraph.attachedBlocks.find((entry) => entry.uniqueId === candidate.blockId);
            const internalPoint = (direction === "input" ? block?.inputs : block?.outputs)?.find((point) => point.name === candidate.pointName);
            if (!internalPoint) {
                throw new TypeError("Invalid aggregate block port exposure target.");
            }
            const existing = existingPoints[index];
            const publicPoint =
                existing ??
                (direction === "input" ? this._registerInput(candidate.publicName, internalPoint.type) : this._registerOutput(candidate.publicName, internalPoint.type));
            if (publicPoint.name !== candidate.publicName || publicPoint.type !== internalPoint.type) {
                throw new TypeError("Serialized aggregate ports do not match the aggregate definition.");
            }
            return { publicPoint, internalPoint };
        });
    }
}
