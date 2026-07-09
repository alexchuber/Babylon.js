import { Document, type Material, type Node as GltfNode } from "@gltf-transform/core";

import { type Nullable } from "core/types";

/**
 * The concrete USD container format a byte payload holds. `usd` is the ambiguous fallback used when a
 * payload matches no known magic (tinyusdz is left to sniff the container itself).
 */
export type UsdSourceFormat = "usda" | "usdc" | "usdz" | "usd";

/**
 * Options controlling a single USD-to-`Document` transcode.
 */
export interface ITranscodeUsdOptions {
    /** The USD container format, as sniffed from the source bytes. */
    readonly sourceFormat: UsdSourceFormat;
    /**
     * URL of the tinyusdz wasm binary. Left undefined, tinyusdz resolves the sidecar next to its JS
     * module (the node_modules layout used for headless builds).
     */
    readonly wasmUrl?: string;
}

// Minimal structural views over the tinyusdz render-scene objects this transcoder reads. tinyusdz
// ships no type declarations, so we describe only the fields consumed here; matrices are column-major
// (glTF convention), so they flow straight into gltf-transform without transposition.
interface ITinyUsdzNode {
    readonly primName: string;
    readonly displayName: string;
    readonly nodeType: string;
    readonly contentId: number;
    readonly localMatrix: ArrayLike<number>;
    readonly children?: ITinyUsdzNode[];
}

interface ITinyUsdzMesh {
    readonly primName: string;
    readonly points: Float32Array;
    readonly faceVertexIndices: Uint32Array;
    readonly normals?: ArrayLike<number>;
    readonly normalsFormat?: string;
    readonly texcoords?: Float32Array;
    readonly materialId: number;
    readonly doubleSided?: boolean;
}

interface ITinyUsdzSceneMetadata {
    readonly upAxis: string;
    readonly metersPerUnit: number;
}

interface ITinyUsdzLoaderNative {
    loadFromBinary(bytes: Uint8Array, filename: string): boolean;
    error(): string;
    getSceneMetadata(): ITinyUsdzSceneMetadata;
    numRootNodes(): number;
    getRootNode(index: number): ITinyUsdzNode;
    getMesh(index: number): ITinyUsdzMesh;
    getMaterial(index: number): { data: string; format: string };
    numTextures(): number;
    numLights(): number;
    numCameras(): number;
    numSkeletons(): number;
    numAnimations(): number;
    numInstances(): number;
}

interface ITinyUsdzModule {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the native embind class name
    TinyUSDZLoaderNative: new () => ITinyUsdzLoaderNative;
}

// USD authors surface (st) with a bottom-left origin; glTF samples TEXCOORD_0 from the top-left, so V
// is flipped on the way in.
function FlipTexcoordV(texcoords: Float32Array): Float32Array<ArrayBuffer> {
    const flipped = new Float32Array(texcoords.length);
    for (let index = 0; index < texcoords.length; index += 2) {
        flipped[index] = texcoords[index];
        flipped[index + 1] = 1 - texcoords[index + 1];
    }
    return flipped;
}

// tinyusdz packs normals as raw floats or as signed-normalized integers (snorm8/snorm16); glTF wants
// float VEC3, so the integer encodings are decoded back to the unit range here.
function DecodeNormals(normals: ArrayLike<number>, format: string | undefined): Float32Array<ArrayBuffer> {
    const decoded = new Float32Array(normals.length);
    const scale = format === "snorm8" ? 1 / 127 : format === "snorm16" ? 1 / 32767 : 1;
    for (let index = 0; index < normals.length; index++) {
        decoded[index] = scale === 1 ? normals[index] : Math.max(-1, normals[index] * scale);
    }
    return decoded;
}

/**
 * Sniffs the USD container format from a payload's leading magic bytes rather than a file extension,
 * so binary `.usdc` and zipped `.usdz` sources are detected even when the caller lacks a filename.
 * @param bytes - The source USD bytes.
 * @returns The detected format, or `usd` when no known magic matches.
 */
export function SniffUsdFormat(bytes: Uint8Array): UsdSourceFormat {
    // "#usda"
    if (bytes.length >= 5 && bytes[0] === 0x23 && bytes[1] === 0x75 && bytes[2] === 0x73 && bytes[3] === 0x64 && bytes[4] === 0x61) {
        return "usda";
    }
    // "PXR-USDC" crate header
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x58 && bytes[2] === 0x52 && bytes[3] === 0x2d) {
        return "usdc";
    }
    // ZIP local-file header ("PK\x03\x04"); usdz is an (uncompressed) zip archive
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
        return "usdz";
    }
    return "usd";
}

/**
 * Builds a gltf-transform PBR metallic-roughness material from a tinyusdz `UsdPreviewSurface`, mapping
 * only the factors that translate cleanly (base color + opacity, metallic, roughness, emissive).
 * @param document - The document the material is created in.
 * @param native - The tinyusdz loader holding the parsed stage.
 * @param materialId - The stage material index to convert.
 * @returns The created material.
 */
function ConvertMaterial(document: Document, native: ITinyUsdzLoaderNative, materialId: number): Material {
    const parsed = JSON.parse(native.getMaterial(materialId).data) as {
        name?: string;
        surfaceShader?: {
            diffuseColor?: number[];
            emissiveColor?: number[];
            metallic?: number;
            roughness?: number;
            opacity?: number;
        };
    };
    const shader = parsed.surfaceShader ?? {};
    const material = document.createMaterial(parsed.name || `material_${materialId}`);

    const diffuse = shader.diffuseColor ?? [1, 1, 1];
    const opacity = typeof shader.opacity === "number" ? shader.opacity : 1;
    material.setBaseColorFactor([diffuse[0] ?? 1, diffuse[1] ?? 1, diffuse[2] ?? 1, opacity]);
    if (typeof shader.metallic === "number") {
        material.setMetallicFactor(shader.metallic);
    }
    if (typeof shader.roughness === "number") {
        material.setRoughnessFactor(shader.roughness);
    }
    if (shader.emissiveColor) {
        material.setEmissiveFactor([shader.emissiveColor[0] ?? 0, shader.emissiveColor[1] ?? 0, shader.emissiveColor[2] ?? 0]);
    }
    material.setAlphaMode(opacity < 1 ? "BLEND" : "OPAQUE");
    return material;
}

/**
 * Converts one tinyusdz render-scene node (and its geometry-bearing descendants) into a gltf-transform
 * node subtree. Nodes that neither carry geometry nor have any geometry below them — USD material and
 * shader prim scopes, empty grouping xforms — are pruned so only renderable hierarchy reaches the SCENE.
 * @param document - The document nodes and meshes are created in.
 * @param native - The tinyusdz loader holding the parsed stage.
 * @param usdNode - The USD node to convert.
 * @param materials - Cache of already-converted materials, keyed by stage material index.
 * @returns The converted node, or null when the subtree contains no geometry.
 */
function ConvertNode(document: Document, native: ITinyUsdzLoaderNative, usdNode: ITinyUsdzNode, materials: Map<number, Material>): Nullable<GltfNode> {
    const childNodes: GltfNode[] = [];
    for (const child of usdNode.children ?? []) {
        const convertedChild = ConvertNode(document, native, child, materials);
        if (convertedChild) {
            childNodes.push(convertedChild);
        }
    }

    const isMesh = usdNode.nodeType === "mesh" && usdNode.contentId >= 0;
    if (!isMesh && childNodes.length === 0) {
        return null;
    }

    const node = document.createNode(usdNode.primName || usdNode.displayName || "node");
    node.setMatrix(Array.from(usdNode.localMatrix) as Parameters<GltfNode["setMatrix"]>[0]);

    if (isMesh) {
        const usdMesh = native.getMesh(usdNode.contentId);
        const buffer = document.getRoot().listBuffers()[0];
        const primitive = document.createPrimitive();
        primitive.setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(usdMesh.points)).setBuffer(buffer));
        primitive.setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint32Array(usdMesh.faceVertexIndices)).setBuffer(buffer));
        if (usdMesh.normals && usdMesh.normals.length > 0) {
            primitive.setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(DecodeNormals(usdMesh.normals, usdMesh.normalsFormat)).setBuffer(buffer));
        }
        if (usdMesh.texcoords && usdMesh.texcoords.length > 0) {
            primitive.setAttribute("TEXCOORD_0", document.createAccessor().setType("VEC2").setArray(FlipTexcoordV(usdMesh.texcoords)).setBuffer(buffer));
        }
        if (usdMesh.materialId >= 0) {
            let material = materials.get(usdMesh.materialId);
            if (!material) {
                material = ConvertMaterial(document, native, usdMesh.materialId);
                materials.set(usdMesh.materialId, material);
            }
            primitive.setMaterial(material);
            if (usdMesh.doubleSided) {
                material.setDoubleSided(true);
            }
        }
        node.setMesh(document.createMesh(usdMesh.primName || usdNode.primName).addPrimitive(primitive));
    }

    for (const childNode of childNodes) {
        node.addChild(childNode);
    }
    return node;
}

/**
 * Transcodes real USD content (`.usda`, binary `.usdc`, or zipped `.usdz`) onto a fresh gltf-transform
 * `Document` (the SCENE spine) using the tinyusdz WebAssembly parser.
 *
 * tinyusdz parses the container, resolves composition (references, payloads, variant selection), and
 * triangulates geometry; this function walks the resulting render scene and maps geometry, node
 * transforms, and `UsdPreviewSurface` materials onto the document. USD is Z-up-capable and unit-scaled,
 * so when the stage is not glTF's Y-up/metre convention the whole scene is parented under a single
 * conversion node. Unmapped USD data (textures, lights, cameras, skinning, animation, point instancers)
 * is dropped and its counts recorded under the document root's `extras.usdImport` loss profile.
 * @param bytes - The source USD bytes.
 * @param options - The source format and optional injected wasm URL.
 * @returns The transcoded gltf-transform `Document`.
 */
export async function TranscodeUsdToDocumentAsync(bytes: Uint8Array, options: ITranscodeUsdOptions): Promise<Document> {
    const { default: createTinyUsdzModule } = await import("tinyusdz/tinyusdz.js");

    const noOp = (): void => {};
    const moduleOptions: Record<string, unknown> = { print: noOp, printErr: noOp };
    if (options.wasmUrl) {
        const wasmUrl = options.wasmUrl;
        moduleOptions.locateFile = (path: string, prefix = "") => (path.endsWith(".wasm") ? wasmUrl : `${prefix}${path}`);
    }

    const wasmModule = (await createTinyUsdzModule(moduleOptions)) as ITinyUsdzModule;
    const native = new wasmModule.TinyUSDZLoaderNative();
    const filename = `asset.${options.sourceFormat === "usd" ? "usd" : options.sourceFormat}`;
    if (!native.loadFromBinary(bytes, filename)) {
        throw new Error(`tinyusdz failed to parse the USD (${options.sourceFormat}) content: ${native.error()}`);
    }

    const document = new Document();
    document.createBuffer();
    const scene = document.createScene("USD");
    const metadata = native.getSceneMetadata();

    // USD roots attach to the scene directly, unless the stage's up-axis or unit scale differs from
    // glTF's (Y-up, metres) — then a single conversion node carries the whole scene into glTF space.
    const upAxis = metadata.upAxis || "Y";
    const metersPerUnit = typeof metadata.metersPerUnit === "number" && metadata.metersPerUnit > 0 ? metadata.metersPerUnit : 1;
    const needsConversion = upAxis !== "Y" || metersPerUnit !== 1;
    let conversionRoot: Nullable<GltfNode> = null;
    if (needsConversion) {
        conversionRoot = document.createNode("USD_Root");
        if (upAxis === "Z") {
            // Rotate USD Z-up into glTF Y-up: -90 degrees about X (quaternion (-sqrt(1/2), 0, 0, sqrt(1/2))).
            conversionRoot.setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
        }
        conversionRoot.setScale([metersPerUnit, metersPerUnit, metersPerUnit]);
        scene.addChild(conversionRoot);
    }

    const materials = new Map<number, Material>();
    const rootCount = native.numRootNodes();
    for (let index = 0; index < rootCount; index++) {
        const converted = ConvertNode(document, native, native.getRootNode(index), materials);
        if (!converted) {
            continue;
        }
        if (conversionRoot) {
            conversionRoot.addChild(converted);
        } else {
            scene.addChild(converted);
        }
    }

    // Record the loss profile so dropped USD features are inspectable rather than silent. tinyusdz
    // resolves composition arcs (references/payloads/variants) during load, so those are composed, not
    // dropped; what this transcoder does not yet map is counted below.
    const droppedTextureCount = native.numTextures();
    const droppedLightCount = native.numLights();
    const droppedCameraCount = native.numCameras();
    const droppedSkeletonCount = native.numSkeletons();
    const droppedAnimationCount = native.numAnimations();
    const droppedInstanceCount = native.numInstances();
    const notes: string[] = [];
    if (droppedTextureCount > 0) {
        notes.push(`Dropped ${droppedTextureCount} texture(s): USD texture bindings are not yet mapped to glTF.`);
    }
    if (droppedLightCount > 0) {
        notes.push(`Dropped ${droppedLightCount} light(s).`);
    }
    if (droppedCameraCount > 0) {
        notes.push(`Dropped ${droppedCameraCount} camera(s).`);
    }
    if (droppedSkeletonCount > 0) {
        notes.push(`Dropped ${droppedSkeletonCount} skeleton(s): skinning is not mapped.`);
    }
    if (droppedAnimationCount > 0) {
        notes.push(`Dropped ${droppedAnimationCount} animation(s).`);
    }
    if (droppedInstanceCount > 0) {
        notes.push(`Dropped ${droppedInstanceCount} point-instancer instance set(s).`);
    }

    document.getRoot().setExtras({
        usdImport: {
            parser: "tinyusdz",
            sourceFormat: options.sourceFormat,
            upAxis,
            metersPerUnit,
            droppedTextureCount,
            droppedLightCount,
            droppedCameraCount,
            droppedSkeletonCount,
            droppedAnimationCount,
            droppedInstanceCount,
            notes,
        },
    });

    return document;
}
