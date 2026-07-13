import { Document, type Material as GltfMaterial, type Node as GltfNode } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { type IResolvedMaterial, type IResolvedPrim, type IResolvedStage, type IStageMetadata } from "loaders/USD/resolution/resolvedStage";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { IsUsdAsset, type UsdAsset } from "../representations/usdAsset";

/**
 * Transcodes a {@link UsdAsset} (USD_STAGE) into a {@link GltfAsset} (GLTF_DOCUMENT).
 *
 * This is the explicit transcoder version of the implicit USD→glTF path inside
 * {@link ImportUSDBlock}. It reads the already-resolved {@link IResolvedStage} from the
 * {@link UsdAsset} input and maps its geometry, materials, and hierarchy onto a fresh
 * gltf-transform `Document`. Resolution diagnostics from the stage are carried into the
 * resulting {@link GltfAsset}'s manifest.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USD2GLTFBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USD2GLTFBlock";

    /** The USD stage to transcode. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting glTF document. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new USD-to-glTF transcoder block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Reads the resolved stage from the USD_STAGE input, converts it to a glTF-Transform `Document`,
     * and wraps the result in a {@link GltfAsset} on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const usdAsset = GetUsdAssetFromInput(this.input.value, this.name);
        const stage = usdAsset.stage;
        const document = ConvertResolvedStageToDocument(stage);

        const diagnostics = stage.diagnostics.map((d) => ({
            severity: d.severity,
            message: d.message,
            ...(d.path ? { path: d.path } : {}),
        }));

        this.output.value = new GltfAsset(document, {
            identity: usdAsset.identity,
            revision: usdAsset.revision,
            manifest: {
                format: "gltf",
                importedFrom: "usd",
                diagnostics,
            } as NodeAssetJsonObject,
        });
    }
}

RegisterBlock(USD2GLTFBlock.ClassName, (name, nodeAsset) => new USD2GLTFBlock(name, nodeAsset));

/**
 * Narrows a runtime connection value to a {@link UsdAsset}, throwing on type mismatch.
 * @param value - The value to narrow.
 * @param blockName - The block name for the error message.
 * @returns The narrowed UsdAsset.
 */
export function GetUsdAssetFromInput(value: unknown, blockName: string): UsdAsset {
    if (!IsUsdAsset(value)) {
        throw new Error(`The "${blockName}" block input did not receive a UsdAsset.`);
    }
    return value;
}

/**
 * Converts a fully-resolved USD stage into a gltf-transform `Document`.
 *
 * Maps the resolved prim hierarchy, mesh geometry, and PBR materials onto glTF equivalents.
 * When the stage's up-axis or unit scale differs from glTF's (Y-up, metres), a single
 * `USD_Root` conversion node wraps the scene.
 * @param stage - The resolved USD stage to convert.
 * @returns The converted gltf-transform `Document`.
 */
export function ConvertResolvedStageToDocument(stage: IResolvedStage): Document {
    const document = new Document();
    document.createBuffer();
    const scene = document.createScene("USD");
    const metadata = stage.metadata;

    const conversionRoot = CreateConversionRoot(document, metadata);
    if (conversionRoot) {
        scene.addChild(conversionRoot);
    }

    const materials = new Map<number, GltfMaterial>();
    for (let i = 0; i < stage.materials.length; i++) {
        materials.set(i, ConvertResolvedMaterial(document, stage.materials[i]));
    }

    for (const child of stage.root.children) {
        const converted = ConvertResolvedPrim(document, stage, child, materials);
        if (!converted) {
            continue;
        }
        if (conversionRoot) {
            conversionRoot.addChild(converted);
        } else {
            scene.addChild(converted);
        }
    }

    return document;
}

function CreateConversionRoot(document: Document, metadata: IStageMetadata): Nullable<GltfNode> {
    const needsConversion = metadata.upAxis !== "Y" || metadata.metersPerUnit !== 1;
    if (!needsConversion) {
        return null;
    }

    const root = document.createNode("USD_Root");
    if (metadata.upAxis === "Z") {
        root.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    }
    root.setScale([metadata.metersPerUnit, metadata.metersPerUnit, metadata.metersPerUnit]);
    return root;
}

function ConvertResolvedMaterial(document: Document, material: IResolvedMaterial): GltfMaterial {
    const gltfMat = document.createMaterial(material.name);
    gltfMat.setBaseColorFactor([material.baseColor[0], material.baseColor[1], material.baseColor[2], material.opacity]);
    gltfMat.setMetallicFactor(material.metallic);
    gltfMat.setRoughnessFactor(material.roughness);
    gltfMat.setEmissiveFactor([material.emissiveColor[0], material.emissiveColor[1], material.emissiveColor[2]]);
    gltfMat.setAlphaMode(material.opacity < 1 ? "BLEND" : "OPAQUE");
    return gltfMat;
}

function ConvertResolvedPrim(document: Document, stage: IResolvedStage, prim: IResolvedPrim, materials: Map<number, GltfMaterial>): Nullable<GltfNode> {
    const childNodes: GltfNode[] = [];
    for (const child of prim.children) {
        const converted = ConvertResolvedPrim(document, stage, child, materials);
        if (converted) {
            childNodes.push(converted);
        }
    }

    const isMesh = prim.kind === "mesh" && prim.meshIndex !== undefined && prim.meshIndex >= 0;
    if (!isMesh && childNodes.length === 0) {
        return null;
    }

    const node = document.createNode(prim.name || "node");
    const transform = prim.transform;
    if (transform.matrix) {
        node.setMatrix(transform.matrix as Parameters<GltfNode["setMatrix"]>[0]);
    } else {
        node.setTranslation(transform.translation);
        node.setRotation(transform.rotation);
        node.setScale(transform.scale);
    }

    if (isMesh) {
        const resolvedMesh = stage.meshes[prim.meshIndex!];
        const buffer = document.getRoot().listBuffers()[0];
        const primitive = document.createPrimitive();
        primitive.setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(resolvedMesh.positions)).setBuffer(buffer));
        primitive.setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint32Array(resolvedMesh.indices)).setBuffer(buffer));
        if (resolvedMesh.normals && resolvedMesh.normals.length > 0) {
            primitive.setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(new Float32Array(resolvedMesh.normals)).setBuffer(buffer));
        }
        if (resolvedMesh.uvSets && resolvedMesh.uvSets.length > 0) {
            primitive.setAttribute("TEXCOORD_0", document.createAccessor().setType("VEC2").setArray(new Float32Array(resolvedMesh.uvSets[0])).setBuffer(buffer));
        }

        const materialIndex = prim.materialBinding?.materialIndex;
        if (materialIndex !== undefined && materials.has(materialIndex)) {
            const material = materials.get(materialIndex)!;
            primitive.setMaterial(material);
            if (resolvedMesh.doubleSided) {
                material.setDoubleSided(true);
            }
        }
        node.setMesh(document.createMesh(prim.name || "mesh").addPrimitive(primitive));
    }

    for (const childNode of childNodes) {
        node.addChild(childNode);
    }
    return node;
}
