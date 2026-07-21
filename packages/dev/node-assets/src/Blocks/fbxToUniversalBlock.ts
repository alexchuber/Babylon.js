import { type AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { FBXFileLoader } from "loaders/FBX/fbxFileLoader.pure";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope } from "../evaluation/buildScope";
import { type NodeAsset } from "../nodeAsset";
import { IsFBXSource } from "../representations/fbxSource";
import { GltfAsset } from "../representations/gltfAsset";

/** Parses an FBX source payload and explicitly crosses into Universal. */
export class FBXToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "FBXToUniversalBlock";

    /** The immutable FBX source payload. */
    public readonly input: NodeAssetConnectionPoint;

    /** The Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates an FBX-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.FBX_SOURCE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /**
     * Loads FBX content with the pure loader, exports it to GLB, and wraps the Universal document.
     * @param scope The optional build scope used for cancellation and cleanup diagnostics.
     */
    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        if (!IsFBXSource(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive an FBX source payload.`);
        }

        scope?.throwIfAborted();
        const source = this.input.value;
        let engine: NullEngine | undefined;
        let scene: Scene | undefined;
        let container: AssetContainer | undefined;
        let primaryError: unknown;
        let failed = false;
        try {
            engine = new NullEngine();
            scene = new Scene(engine);
            scope?.throwIfAborted();

            const loader = new FBXFileLoader();
            container = await loader.loadAssetContainerAsync(scene, source.data, source.rootUrl, undefined, source.source);
            scope?.throwIfAborted();
            container.addAllToScene();
            scope?.throwIfAborted();

            const glbData = await GLTF2Export.GLBAsync(scene, "fbx-universal", { exportWithoutWaitingForScene: true });
            scope?.throwIfAborted();
            const glb = glbData.files["fbx-universal.glb"];
            const bytes = glb instanceof Blob ? new Uint8Array(await glb.arrayBuffer()) : new TextEncoder().encode(glb);
            scope?.throwIfAborted();
            const [{ WebIO }, { ALL_EXTENSIONS }] = await Promise.all([import("@gltf-transform/core"), import("@gltf-transform/extensions")]);
            scope?.throwIfAborted();
            const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
            scope?.throwIfAborted();
            this.output.value = new GltfAsset(document, {
                identity: source.source,
                revision: 0,
                manifest: { format: "universal", importedFrom: "fbx", source: source.source },
            });
        } catch (error) {
            failed = true;
            primaryError = scope?.isCancellationError(error)
                ? error
                : new Error(`The "${this.name}" block failed to convert "${source.source}" to Universal: ${error instanceof Error ? error.message : String(error)}`, {
                      cause: error,
                  });
        }

        const cleanupErrors: unknown[] = [];
        if (container) {
            try {
                container.dispose();
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        if (scene) {
            try {
                scene.dispose();
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        if (engine) {
            try {
                engine.dispose();
            } catch (error) {
                cleanupErrors.push(error);
            }
        }

        if (scope) {
            for (const cleanupError of cleanupErrors) {
                scope.addDiagnostic({
                    code: "NODE_ASSET_FBX_CLEANUP_FAILED",
                    severity: "warning",
                    message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    producer: { kind: "transcoder", blockId: this.uniqueId, blockName: this.name },
                });
            }
        }

        if (failed) {
            if (scope?.isCancellationError(primaryError)) {
                throw primaryError;
            }
            const conversionError = primaryError as Error;
            if (cleanupErrors.length > 0) {
                throw new AggregateError([conversionError, ...cleanupErrors], `${conversionError.message} FBX resource cleanup also failed.`, { cause: conversionError });
            }
            throw conversionError;
        }
        if (cleanupErrors.length > 0) {
            throw new AggregateError(cleanupErrors, `The "${this.name}" block failed to dispose FBX conversion resources.`, { cause: cleanupErrors[0] });
        }
    }
}

RegisterBlock(FBXToUniversalBlock.ClassName, (name, nodeAsset) => new FBXToUniversalBlock(name, nodeAsset));
