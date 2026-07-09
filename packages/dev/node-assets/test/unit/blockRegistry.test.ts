import { describe, expect, it, vi } from "vitest";

// Import from the package barrel (not the individual block modules) on purpose: the barrel re-exports
// every block, so this test observes the exact set the published package registers. The coverage below
// therefore fails if any block is dropped from the barrel or stops self-registering.
import {
    CenterBlock,
    DedupBlock,
    DracoCompressionBlock,
    ExportGLTFBlock,
    FlattenBlock,
    GetProperty,
    ImportGLTFBlock,
    JoinBlock,
    JsonLiteral,
    KTX2CompressionBlock,
    NodeAsset,
    NormalsBlock,
    NumberLiteral,
    PruneBlock,
    QuantizeBlock,
    Selector,
    SetProperty,
    SimplifyBlock,
    StringLiteral,
    WeldBlock,
    // eslint-disable-next-line import/no-internal-modules
} from "../../src/index";
import { CreateBlockByClassName, GetRegisteredBlockClassNames } from "../../src/blockFoundation/blockRegistry";

// The import/export blocks register the Draco encoder/decoder, so the buildAsync roundtrip needs the
// real draco3dgltf module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const DecodeWidth = 64;
const DecodeHeight = 64;

/**
 * Stand-in image decoder for the Node/test environment: the browser build decodes via canvas, but
 * the Node build requires an injected decoder. The block only needs raw RGBA + dimensions, so this
 * returns a solid buffer and ignores the (placeholder) source bytes.
 * @returns Raw RGBA image data with fixed dimensions.
 */
async function DecodeSolidRgbaAsync(): Promise<{ width: number; height: number; data: Uint8Array }> {
    return { width: DecodeWidth, height: DecodeHeight, data: new Uint8Array(DecodeWidth * DecodeHeight * 4).fill(128) };
}

/**
 * Builds a tiny glb with a material carrying a color (base color) and a data (normal) texture, so a
 * KTX2 compression block has one texture of each codec class to encode.
 * @returns The fixture glb bytes.
 */
async function CreateTexturedGlbAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);

    const baseColorTexture = document.createTexture("baseColor").setImage(new Uint8Array(32).fill(1)).setMimeType("image/png");
    const normalTexture = document.createTexture("normal").setImage(new Uint8Array(32).fill(2)).setMimeType("image/png");
    const material = document.createMaterial("material0").setBaseColorTexture(baseColorTexture).setNormalTexture(normalTexture);

    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("block self-registration", () => {
    // Regression for the milestone-1 bug: KTX2CompressionBlock was omitted from the hand-maintained
    // deserialization switch, so loading a saved graph that contained one threw
    // `Cannot deserialize unknown block type "KTX2CompressionBlock"`. Self-registration removes the
    // switch; this test fails against the omitted-switch state and passes once blocks self-register.
    it("reconstructs a KTX2-containing graph through save/load and rebuilds it", async () => {
        const glb = await CreateTexturedGlbAsync();

        const asset = new NodeAsset("ktx2-save-load");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const ktx2 = new KTX2CompressionBlock("ktx2", asset);
        ktx2.imageDecoder = DecodeSolidRgbaAsync;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(ktx2.input);
        ktx2.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // The KTX2 block is reconstructed as the right class, in order, with its wiring intact.
        expect(parsed.attachedBlocks).toHaveLength(3);
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFBlock;
        const parsedKtx2 = parsed.attachedBlocks[1] as KTX2CompressionBlock;
        const parsedExporter = parsed.attachedBlocks[2] as ExportGLTFBlock;
        expect(parsedKtx2).toBeInstanceOf(KTX2CompressionBlock);
        expect(parsedImporter.output.connectedPoint).toBe(parsedKtx2.input);
        expect(parsedKtx2.output.connectedPoint).toBe(parsedExporter.input);

        // The reparsed graph still builds; inject the headless decoder the function-valued field
        // cannot carry through serialization, then confirm the rebuilt glb actually carries KTX2.
        parsedKtx2.imageDecoder = DecodeSolidRgbaAsync;
        const result = await parsed.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const reparsed = await io.readBinary(result);
        expect(
            reparsed
                .getRoot()
                .listExtensionsUsed()
                .map((extension) => extension.extensionName)
        ).toContain("KHR_texture_basisu");
    });

    describe("registration coverage", () => {
        // Enumerated from the registry at collection time; every block reachable from the package
        // entry is covered, so a future block that fails to register cannot silently drop out.
        const registeredClassNames = GetRegisteredBlockClassNames();

        it("registers every built-in block", () => {
            expect(registeredClassNames).toEqual(
                expect.arrayContaining([
                    ImportGLTFBlock.ClassName,
                    DracoCompressionBlock.ClassName,
                    ExportGLTFBlock.ClassName,
                    KTX2CompressionBlock.ClassName,
                    WeldBlock.ClassName,
                    DedupBlock.ClassName,
                    PruneBlock.ClassName,
                    QuantizeBlock.ClassName,
                    SimplifyBlock.ClassName,
                    FlattenBlock.ClassName,
                    JoinBlock.ClassName,
                    NormalsBlock.ClassName,
                    CenterBlock.ClassName,
                    NumberLiteral.ClassName,
                    StringLiteral.ClassName,
                    JsonLiteral.ClassName,
                    Selector.ClassName,
                    GetProperty.ClassName,
                    SetProperty.ClassName,
                ])
            );
            expect(registeredClassNames).toHaveLength(19);
        });

        it.each(registeredClassNames)("round-trips %s through serialize/Parse", (className) => {
            const asset = new NodeAsset("coverage");
            const created = CreateBlockByClassName(className, className, asset);
            expect(created.getClassName()).toBe(className);

            const serialized = JSON.parse(JSON.stringify(asset.serialize()));
            const parsed = NodeAsset.Parse(serialized);

            expect(parsed.attachedBlocks).toHaveLength(1);
            expect(parsed.attachedBlocks[0].getClassName()).toBe(className);
            expect(parsed.attachedBlocks[0].uniqueId).toBe(created.uniqueId);
        });

        it("throws a clear error for an unknown block type", () => {
            const asset = new NodeAsset("unknown");
            expect(() => CreateBlockByClassName("NotARealBlock", "x", asset)).toThrow('Cannot deserialize unknown block type "NotARealBlock".');
        });
    });
});
