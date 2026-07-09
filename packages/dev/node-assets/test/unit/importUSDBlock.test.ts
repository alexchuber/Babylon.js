import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportUSDBlock } from "../../src/Blocks/importUSDBlock";
import { SniffUsdFormat } from "../../src/Blocks/tinyUsdzTranscoder";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// ExportGLTFBlock resolves the real Draco encoder and ImportGLTFBlock the decoder; the global vitest
// setup stubs draco3dgltf for @dev/core, so restore the real module for the export/re-import roundtrip.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// A single Xform (translated) holding a quad Mesh (with normals + uvs) bound to a UsdPreviewSurface
// Material. The quad exercises triangulation (4 verts -> 6 indices); the Material exercises the PBR
// factor mapping; the Material/Shader prims exercise pruning (they must not become SCENE nodes).
const QuadUsda = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    double3 xformOp:translate = (1, 2, 3)
    uniform token[] xformOpOrder = ["xformOp:translate"]

    def Mesh "Quad"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]
        normal3f[] primvars:normals = [(0, 0, 1), (0, 0, 1), (0, 0, 1), (0, 0, 1)] (
            interpolation = "vertex"
        )
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (
            interpolation = "vertex"
        )
        rel material:binding = </World/RedMat>
    }

    def Material "RedMat"
    {
        token outputs:surface.connect = </World/RedMat/Shader.outputs:surface>
        def Shader "Shader"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0.8, 0.1, 0.1)
            float inputs:metallic = 0.25
            float inputs:roughness = 0.4
            color3f inputs:emissiveColor = (0, 0.5, 0)
            float inputs:opacity = 0.5
            token outputs:surface
        }
    }
}
`;

// A Z-up, centimeter-scaled stage: the transcoder must wrap the roots in a USD_Root conversion node.
const ZUpUsda = `#usda 1.0
(
    upAxis = "Z"
    metersPerUnit = 0.01
)

def Xform "Root"
{
    def Mesh "Tri"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
}
`;

// A stage whose only non-geometry prims are two lights: they must be pruned from the SCENE and their
// count recorded in the loss profile (proving the profile captures real, non-zero drops).
const LitUsda = `#usda 1.0
def Xform "World"
{
    def Mesh "Tri"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
    def DistantLight "Sun"
    {
        float inputs:intensity = 500
    }
    def SphereLight "Bulb"
    {
        float inputs:intensity = 100
    }
}
`;

const MinimalUsda = `#usda 1.0
def Xform "World"
{
    def Mesh "Tri"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
}
`;

/**
 * Runs USD bytes through {@link ImportUSDBlock} and returns the transcoded document.
 * @param bytes - The source USD bytes.
 * @returns The transcoded gltf-transform `Document`.
 */
async function ImportUsdAsync(bytes: Uint8Array): Promise<Document> {
    const block = new ImportUSDBlock("usd", new NodeAsset("usd"));
    block.data = bytes;
    await block._buildBlockAsync();
    return block.output.value as Document;
}

/**
 * CRC-32 (as required by the ZIP local/central headers) of a byte buffer.
 * @param bytes - The bytes to checksum.
 * @returns The CRC-32 value.
 */
function Crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index++) {
        let c = (crc ^ bytes[index]) & 0xff;
        for (let bit = 0; bit < 8; bit++) {
            c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
        }
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Packs a single USD layer into a minimal, uncompressed, spec-aligned `.usdz` (a ZIP whose entry data
 * starts on a 64-byte boundary). This keeps the binary-parsing test self-contained — no committed blob.
 * @param name - The archived layer's filename.
 * @param data - The layer bytes.
 * @returns The `.usdz` bytes.
 */
function BuildUsdz(name: string, data: Uint8Array): Uint8Array {
    const nameBytes = new TextEncoder().encode(name);
    const crc = Crc32(data);
    // Pad (via the local header's "extra" field) so the entry data lands on a 64-byte boundary.
    const dataStartWithoutExtra = 30 + nameBytes.length;
    let extraLength = (64 - (dataStartWithoutExtra % 64)) % 64;
    if (extraLength > 0 && extraLength < 4) {
        extraLength += 64;
    }
    const extra = new Uint8Array(extraLength);
    if (extraLength >= 4) {
        extra[0] = 0xe4;
        extra[1] = 0x50;
        extra[2] = (extraLength - 4) & 0xff;
        extra[3] = ((extraLength - 4) >> 8) & 0xff;
    }

    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, data.length, true);
    localHeader.setUint32(22, data.length, true);
    localHeader.setUint16(26, nameBytes.length, true);
    localHeader.setUint16(28, extraLength, true);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, 20, true);
    centralHeader.setUint16(6, 20, true);
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, data.length, true);
    centralHeader.setUint32(24, data.length, true);
    centralHeader.setUint16(28, nameBytes.length, true);

    const localHeaderBytes = new Uint8Array(localHeader.buffer);
    const centralHeaderBytes = new Uint8Array(centralHeader.buffer);
    const centralDirectoryOffset = localHeaderBytes.length + nameBytes.length + extra.length + data.length;
    const centralDirectorySize = centralHeaderBytes.length + nameBytes.length;

    const endOfCentralDirectory = new DataView(new ArrayBuffer(22));
    endOfCentralDirectory.setUint32(0, 0x06054b50, true);
    endOfCentralDirectory.setUint16(8, 1, true);
    endOfCentralDirectory.setUint16(10, 1, true);
    endOfCentralDirectory.setUint32(12, centralDirectorySize, true);
    endOfCentralDirectory.setUint32(16, centralDirectoryOffset, true);

    const parts = [localHeaderBytes, nameBytes, extra, data, centralHeaderBytes, nameBytes, new Uint8Array(endOfCentralDirectory.buffer)];
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const usdz = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
        usdz.set(part, cursor);
        cursor += part.length;
    }
    return usdz;
}

describe("ImportUSDBlock", () => {
    it("registers no inputs and a single SCENE output", () => {
        const asset = new NodeAsset("usd");
        const block = new ImportUSDBlock("usd", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(0);
        expect(block.outputs).toHaveLength(1);
        expect(block.output).toBe(block.outputs[0]);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("transcodes geometry, materials, and the node hierarchy onto the SCENE", async () => {
        const document = await ImportUsdAsync(new TextEncoder().encode(QuadUsda));
        const root = document.getRoot();

        // World (Xform) + Quad (Mesh) are the only nodes; RedMat (Material) and Shader are pruned.
        expect(root.listNodes()).toHaveLength(2);
        expect(root.listMeshes()).toHaveLength(1);
        expect(root.listMaterials()).toHaveLength(1);

        const worldNode = root.listNodes().find((node) => node.getName() === "World");
        expect(worldNode?.getTranslation()).toEqual([1, 2, 3]);
        expect(worldNode?.listChildren().map((child) => child.getName())).toEqual(["Quad"]);

        // The quad's four vertices triangulate into two triangles (six indices); the vertex-interpolated
        // normals and uvs map straight across.
        const primitive = root.listMeshes()[0].listPrimitives()[0];
        expect(primitive.getAttribute("POSITION")?.getCount()).toBe(4);
        expect(primitive.getIndices()?.getCount()).toBe(6);
        expect(primitive.getAttribute("NORMAL")?.getCount()).toBe(4);
        expect(primitive.getAttribute("TEXCOORD_0")?.getCount()).toBe(4);

        const material = root.listMaterials()[0];
        const baseColor = material.getBaseColorFactor();
        expect(baseColor[0]).toBeCloseTo(0.8, 5);
        expect(baseColor[1]).toBeCloseTo(0.1, 5);
        expect(baseColor[2]).toBeCloseTo(0.1, 5);
        expect(baseColor[3]).toBeCloseTo(0.5, 5);
        expect(material.getMetallicFactor()).toBeCloseTo(0.25, 5);
        expect(material.getRoughnessFactor()).toBeCloseTo(0.4, 5);
        expect(material.getEmissiveFactor()[1]).toBeCloseTo(0.5, 5);
        // opacity < 1 must select alpha blending.
        expect(material.getAlphaMode()).toBe("BLEND");
    });

    it("flips the texcoord V so USD st maps to the glTF top-left convention", async () => {
        const document = await ImportUsdAsync(new TextEncoder().encode(QuadUsda));
        const uv = document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("TEXCOORD_0")?.getElement(0, [0, 0]);

        // USD st (0, 0) is bottom-left; glTF samples top-left, so V is flipped to (0, 1).
        expect(uv?.[0]).toBeCloseTo(0, 5);
        expect(uv?.[1]).toBeCloseTo(1, 5);
    });

    it("records the loss profile extras with dropped-feature counts and notes", async () => {
        const document = await ImportUsdAsync(new TextEncoder().encode(LitUsda));
        const root = document.getRoot();
        const extras = root.getExtras() as {
            usdImport?: { parser?: string; sourceFormat?: string; upAxis?: string; metersPerUnit?: number; droppedLightCount?: number; notes?: string[] };
        };

        // The two lights are pruned from the SCENE but recorded as a non-silent, inspectable loss.
        expect(root.listNodes().map((node) => node.getName())).toEqual(expect.arrayContaining(["World", "Tri"]));
        expect(root.listNodes()).toHaveLength(2);
        expect(extras.usdImport?.parser).toBe("tinyusdz");
        expect(extras.usdImport?.sourceFormat).toBe("usda");
        expect(extras.usdImport?.upAxis).toBe("Y");
        expect(extras.usdImport?.metersPerUnit).toBe(1);
        expect(extras.usdImport?.droppedLightCount).toBe(2);
        expect(extras.usdImport?.notes).toEqual(expect.arrayContaining([expect.stringContaining("2 light(s)")]));
    });

    it("wraps Z-up, non-metric stages in a conversion node", async () => {
        const document = await ImportUsdAsync(new TextEncoder().encode(ZUpUsda));
        const root = document.getRoot();

        // USD_Root (conversion) + Root (Xform) + Tri (Mesh).
        expect(root.listNodes()).toHaveLength(3);
        const sceneChildren = root.listScenes()[0].listChildren();
        expect(sceneChildren).toHaveLength(1);
        expect(sceneChildren[0].getName()).toBe("USD_Root");
        expect(sceneChildren[0].getScale()[0]).toBeCloseTo(0.01, 5);
        // Z-up -> Y-up is a -90 degree rotation about X.
        expect(sceneChildren[0].getRotation()[0]).toBeCloseTo(-Math.SQRT1_2, 5);
        expect(sceneChildren[0].getRotation()[3]).toBeCloseTo(Math.SQRT1_2, 5);

        const extras = root.getExtras() as { usdImport?: { upAxis?: string; metersPerUnit?: number } };
        expect(extras.usdImport?.upAxis).toBe("Z");
        expect(extras.usdImport?.metersPerUnit).toBeCloseTo(0.01, 5);
    });

    it("sniffs the USD container format from magic bytes rather than the filename", () => {
        expect(SniffUsdFormat(new TextEncoder().encode("#usda 1.0\n"))).toBe("usda");
        // "PXR-USDC" crate header.
        expect(SniffUsdFormat(new Uint8Array([0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43]))).toBe("usdc");
        // ZIP local-file header ("PK\x03\x04").
        expect(SniffUsdFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe("usdz");
        // Unknown magic falls back to the ambiguous container.
        expect(SniffUsdFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe("usd");
    });

    it("parses binary .usdz (zip) content, not just ASCII .usda", async () => {
        const usdz = BuildUsdz("root.usda", new TextEncoder().encode(MinimalUsda));
        expect(SniffUsdFormat(usdz)).toBe("usdz");

        const document = await ImportUsdAsync(usdz);
        const root = document.getRoot();

        expect(root.listMeshes()).toHaveLength(1);
        expect(root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(3);
        expect((root.getExtras() as { usdImport?: { sourceFormat?: string } }).usdImport?.sourceFormat).toBe("usdz");
    });

    it("builds through ImportUSD -> ExportGLTF and re-imports to the same mesh and material", async () => {
        const asset = new NodeAsset("usd-roundtrip");
        const importer = new ImportUSDBlock("import", asset);
        importer.data = new TextEncoder().encode(QuadUsda);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const glb = await asset.buildAsync();
        expect(glb).toBeInstanceOf(Uint8Array);
        expect(glb.length).toBeGreaterThan(0);

        const reimporter = new ImportGLTFBlock("reimport", new NodeAsset("reimport"));
        reimporter.data = glb;
        await reimporter._buildBlockAsync();
        const reimported = reimporter.output.value as Document;

        expect(reimported.getRoot().listMeshes()).toHaveLength(1);
        expect(reimported.getRoot().listMaterials()).toHaveLength(1);
        expect(reimported.getRoot().listMeshes()[0].listPrimitives()[0].getIndices()?.getCount()).toBe(6);
    });

    it("roundtrips its source bytes through serialize/Parse", () => {
        const asset = new NodeAsset("usd-serialize");
        const block = new ImportUSDBlock("usd", asset);
        block.data = new TextEncoder().encode(QuadUsda);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);
        const parsedBlock = parsed.attachedBlocks[0] as ImportUSDBlock;

        expect(parsedBlock).toBeInstanceOf(ImportUSDBlock);
        expect(parsedBlock.data).toEqual(block.data);
    });

    it("throws when there is no data to import", async () => {
        const block = new ImportUSDBlock("usd", new NodeAsset("usd"));
        await expect(block._buildBlockAsync()).rejects.toThrow(/no data to import/);
    });
});
