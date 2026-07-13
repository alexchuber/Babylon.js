import { type Nullable } from "core/types";
import { DecodeBase64ToBinary, EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { GetSerializedNullableString, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { SniffUsdFormat } from "./tinyUsdzTranscoder";

/**
 * Imports USD content onto a fresh gltf-transform `Document` and exposes it on its glTF representation
 * output. This is the first non-glTF entry point (a **Sources** block).
 *
 * ## Parser: tinyusdz (real USD)
 *
 * Parsing is delegated to {@link https://github.com/lighttransport/tinyusdz | tinyusdz} (Apache-2.0), a
 * WebAssembly USD reader. Unlike a hand-written ASCII subset, tinyusdz reads the real formats and
 * resolves composition during load, so this block supports:
 *
 * - **ASCII `.usda`, binary `.usdc` (crate), and zipped `.usdz`** — the concrete format is sniffed from
 *   the payload's magic bytes ({@link SniffUsdFormat}), not the filename.
 * - **Composition** — references, payloads, sublayers, inherits/specializes, and variant selection are
 *   resolved by tinyusdz before the scene is read, so they are *composed*, not dropped.
 * - **Geometry** — triangulated `Mesh` prims with positions, indices, normals (float or snorm), and the
 *   first texcoord set.
 * - **Materials** — `UsdPreviewSurface` → glTF PBR metallic-roughness factors (base color + opacity,
 *   metallic, roughness, emissive).
 * - **Hierarchy + transforms** — the composed node tree, each node's local matrix, and the stage
 *   `upAxis`/`metersPerUnit` (a non-Y-up or non-metric stage is wrapped in a single `USD_Root`
 *   conversion node).
 *
 * The wasm binary is delivered by an injectable URL ({@link usdWasmUrl}), mirroring the Draco/KTX2
 * blocks; left undefined it resolves the sidecar next to the tinyusdz module (headless Node builds).
 *
 * ## Loss profile (dropped)
 *
 * Textures/texture graphs, lights, cameras, skeletons/skinning, animation, and point-instancer instance
 * sets are not yet mapped and are dropped. Their counts and human-readable notes are recorded under the
 * document root's `extras.usdImport` so the loss is inspectable rather than silent.
 */
export class ImportUSDBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportUSDBlock";

    /** The source USD bytes to import (set by the caller / editor file picker). */
    public data: Nullable<Uint8Array> = null;

    /** The imported gltf-transform `Document`. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * URL of the tinyusdz wasm binary. Left undefined, tinyusdz resolves the sidecar from its package
     * default location for headless Node usage.
     */
    public usdWasmUrl: string | undefined = undefined;

    /**
     * Creates a new USD import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Sniffs {@link data}'s USD format, transcodes it onto a gltf-transform `Document`, and sets that
     * document as the output value.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (!this.data) {
            throw new Error(`The "${this.name}" USD import block has no data to import.`);
        }

        const { TranscodeUsdToDocumentAsync } = await import("./tinyUsdzTranscoder");
        const sourceFormat = SniffUsdFormat(this.data);
        const document = await TranscodeUsdToDocumentAsync(this.data, { sourceFormat, wasmUrl: this.usdWasmUrl });
        this.output.value = new GltfAsset(document, {
            identity: this.name,
            revision: 0,
            manifest: {
                format: "gltf",
                importedFrom: "usd",
                sourceFormat,
            },
        });
    }

    /**
     * Serializes this block, encoding its {@link data} bytes as base64 so the source USD roundtrips
     * through save/load.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.data = this.data ? EncodeArrayBufferToBase64(this.data) : null;
        return serializationObject;
    }

    /**
     * Restores this block's {@link data} bytes from a base64 string produced by {@link serialize}.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        const data = GetSerializedNullableString(serializationObject, "data");
        this.data = data ? new Uint8Array(DecodeBase64ToBinary(data)) : null;
    }
}

RegisterBlock(ImportUSDBlock.ClassName, (name, nodeAsset) => new ImportUSDBlock(name, nodeAsset));
