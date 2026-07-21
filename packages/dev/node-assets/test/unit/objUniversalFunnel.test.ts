import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NullEngine } from "core/Engines/nullEngine";
import { FilesInputStore } from "core/Misc/filesInputStore";
import { Observable } from "core/Misc/observable";
import { Tools } from "core/Misc/tools.pure";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportOBJAggregateBlock } from "../../src/Blocks/importOBJAggregateBlock";
import { OBJToUniversalBlock } from "../../src/Blocks/objToUniversalBlock";
import { ReadOBJBlock } from "../../src/Blocks/readOBJBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { WriteGLTFBlock } from "../../src/Blocks/writeGLTFBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { IsOBJSourceAsset, OBJSourceAsset } from "../../src/representations/objSourceAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

class TestFileReader {
    public result: string | ArrayBuffer | null = null;
    public onerror: (() => void) | null = null;
    public onload: ((event: { target: TestFileReader }) => void) | null = null;
    public onloadend: (() => void) | null = null;
    public onprogress: (() => void) | null = null;

    public abort(): void {}

    public readAsArrayBuffer(file: Blob): void {
        void this._readAsync(file, true);
    }

    public readAsText(file: Blob): void {
        void this._readAsync(file, false);
    }

    private async _readAsync(file: Blob, useArrayBuffer: boolean): Promise<void> {
        try {
            this.result = useArrayBuffer ? await file.arrayBuffer() : await file.text();
            this.onload?.({ target: this });
        } catch {
            this.onerror?.();
        } finally {
            this.onloadend?.();
        }
    }
}

vi.stubGlobal("FileReader", TestFileReader);

const OBJFixture = new TextEncoder().encode(`# Synthetic NodeAssets OBJ fixture
o FirstObject
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 1//1 2//1 3//1
g SecondGroup
v 2 0 0
v 3 0 0
v 2 1 0
f 4//1 5//1 6//1
`);

const OBJWithMaterialFixture = new TextEncoder().encode(`mtllib model.mtl
o MaterialObject
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
usemtl Material
f 1//1 2//1 3//1
`);

const MTLFixture = `newmtl Material
Kd 1.0 0.0 0.0
`;

const OBJWithUrlTextureFixture = new TextEncoder().encode(`mtllib model.mtl
o TexturedObject
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl TexturedMaterial
f 1/1/1 2/2/1 3/3/1
`);

const MTLWithUrlTextureFixture = `newmtl TexturedMaterial
Kd 1.0 1.0 1.0
map_Kd tiny.png
`;

const OBJBundleFixture = new TextEncoder().encode(`mtllib ignored.mtl
mtllib ../MATERIALS/catalog.mtl
o MaterialObject
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
usemtl RedMaterial
f 1/1/1 2/2/1 3/3/1
usemtl TexturedMaterial
f 1/1/1 3/3/1 4/4/1
`);

const MTLBundleFixture = new TextEncoder().encode(`newmtl RedMaterial
Kd 1.0 0.0 0.0
newmtl TexturedMaterial
Kd 0.0 1.0 0.0
map_Kd ../TEXTURES/tiny.png
`);

const TinyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const TinyPngWithTrailingByte = new Uint8Array([...TinyPng, 0]);

function ArrayBufferFor(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function GetAssetFactsAsync(glb: Uint8Array): Promise<{
    readonly sceneCount: number;
    readonly nodes: readonly string[];
    readonly meshCount: number;
    readonly primitiveCount: number;
    readonly materials: ReadonlyArray<{
        readonly name: string;
        readonly baseColorFactor: readonly number[];
        readonly hasBaseColorTexture: boolean;
    }>;
    readonly textures: ReadonlyArray<{ readonly mimeType: string | null; readonly byteLength: number }>;
}> {
    const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
    const meshes = document.getRoot().listMeshes();
    return {
        sceneCount: document.getRoot().listScenes().length,
        nodes: document
            .getRoot()
            .listNodes()
            .map((node) => node.getName()),
        meshCount: meshes.length,
        primitiveCount: meshes.reduce((total, mesh) => total + mesh.listPrimitives().length, 0),
        materials: document
            .getRoot()
            .listMaterials()
            .map((material) => ({
                name: material.getName(),
                baseColorFactor: [...material.getBaseColorFactor()],
                hasBaseColorTexture: material.getBaseColorTexture() !== null,
            })),
        textures: document
            .getRoot()
            .listTextures()
            .map((texture) => ({ mimeType: texture.getMimeType(), byteLength: texture.getImage()?.byteLength ?? 0 })),
    };
}

function CreatePrimitivePipeline(
    bytes = OBJFixture,
    fileName = "fixture.OBJ"
): {
    readonly asset: NodeAsset;
    readonly read: ReadOBJBlock;
    readonly transcoder: OBJToUniversalBlock;
} {
    const asset = new NodeAsset("primitive-obj");
    const read = new ReadOBJBlock("Read OBJ", asset);
    read.setUploadedSource(bytes, fileName);
    const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    read.output.connectTo(transcoder.input);
    transcoder.output.connectTo(exporter.input);
    return { asset, read, transcoder };
}

function CreateBundlePipeline(): { readonly asset: NodeAsset; readonly read: ReadOBJBlock } {
    const asset = new NodeAsset("bundle-obj");
    const read = new ReadOBJBlock("Read OBJ", asset);
    read.setUploadedSourceBundle([
        { path: "Models/material.obj", bytes: OBJBundleFixture },
        { path: "Materials/Catalog.MTL", bytes: MTLBundleFixture },
        { path: "Textures/Tiny.PNG", bytes: TinyPng },
    ]);
    const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    read.output.connectTo(transcoder.input);
    transcoder.output.connectTo(exporter.input);
    return { asset, read };
}

function CreateNamedBundlePipeline(
    materialName: string,
    color: string,
    textureBytes: Uint8Array
): {
    readonly asset: NodeAsset;
    readonly read: ReadOBJBlock;
} {
    const obj = new TextEncoder().encode(`mtllib Materials/catalog.mtl
o ${materialName}Object
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl ${materialName}
f 1/1/1 2/2/1 3/3/1
`);
    const mtl = new TextEncoder().encode(`newmtl ${materialName}
Kd ${color}
map_Kd Textures/tiny.png
`);
    const asset = new NodeAsset(`${materialName}-bundle`);
    const read = new ReadOBJBlock("Read OBJ", asset);
    read.setUploadedSourceBundle([
        { path: "model.obj", bytes: obj },
        { path: "catalog.mtl", bytes: mtl },
        { path: "tiny.png", bytes: textureBytes },
    ]);
    const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    read.output.connectTo(transcoder.input);
    transcoder.output.connectTo(exporter.input);
    return { asset, read };
}

async function CreateUrlPipelineAsync(url: string, bytes = OBJFixture) {
    const asset = new NodeAsset("url-obj");
    const read = new ReadOBJBlock("Read OBJ", asset);
    const fetcher = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => ArrayBufferFor(bytes),
    }));
    await read.setUrlAsync(url, fetcher);
    const objToUniversal = new OBJToUniversalBlock("OBJ to Universal", asset);
    const universalToGltf = new UniversalToGLTFBlock("Universal to glTF", asset);
    const exporter = new ExportGLTFBlock("Export glTF", asset);
    read.output.connectTo(objToUniversal.input);
    objToUniversal.output.connectTo(universalToGltf.input);
    universalToGltf.output.connectTo(exporter.input);
    return { asset, fetcher };
}

describe("OBJ Universal funnel", () => {
    it("keeps an immutable shallow OBJ source behind its matching transcoder", async () => {
        const sourceBytes = OBJFixture.slice();
        const source = new OBJSourceAsset({ path: "fixture.obj", bytes: sourceBytes }, "fixture.obj", "upload", []);
        sourceBytes[0] = 0;

        const firstPrimary = source.primary;
        firstPrimary.bytes[0] = 0;
        expect(source.primary.bytes).toEqual(OBJFixture);
        expect(source.companions).toEqual([]);
        expect(Object.isFrozen(source.primary)).toBe(true);
        expect(Object.isFrozen(source.companions)).toBe(true);
        expect(IsOBJSourceAsset(source)).toBe(true);

        const asset = new NodeAsset("obj-source-kind");
        const read = new ReadOBJBlock("Read OBJ", asset);
        const toUniversal = new OBJToUniversalBlock("OBJ to Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal to glTF", asset);
        const write = new WriteGLTFBlock("Write glTF", asset);

        expect(read.inputs).toHaveLength(0);
        expect(read.output.type).toBe(NodeAssetConnectionPointType.OBJ_SOURCE);
        expect(toUniversal.input.type).toBe(NodeAssetConnectionPointType.OBJ_SOURCE);
        expect(() => read.output.connectTo(toGltf.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(write.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(toUniversal.input)).not.toThrow();

        read.setUploadedSource(OBJFixture, "fixture.obj");
        await read._buildBlockAsync();
        expect(IsOBJSourceAsset(read.output.value)).toBe(true);
    });

    it("builds an extensionless query OBJ URL into an inspectable GLB", async () => {
        const source = "https://example.com/assets/model?format=obj";
        const { asset, fetcher } = await CreateUrlPipelineAsync(source);
        const result = await asset.buildAsync();

        expect(fetcher).toHaveBeenCalledExactlyOnceWith(source);
        expect(result.byteLength).toBeGreaterThan(0);
        expect(await GetAssetFactsAsync(result)).toMatchObject({ meshCount: 2, primitiveCount: 2 });
    });

    it("builds a conventional OBJ URL and resolves its MTL relative to the source folder", async () => {
        const source = "https://example.com/assets/model.obj";
        const materialUrl = "https://example.com/assets/model.mtl";
        const loadFile = vi.spyOn(Tools, "LoadFile").mockImplementation((url, onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
            if (url === materialUrl) {
                onSuccess(MTLFixture);
            } else {
                onError?.(undefined, new Error(`Unexpected MTL URL: ${url}`));
            }
            return { abort: () => undefined, onCompleteObservable: new Observable() };
        });
        try {
            const { asset, fetcher } = await CreateUrlPipelineAsync(source, OBJWithMaterialFixture);
            const result = await asset.buildAsync();

            expect(fetcher).toHaveBeenCalledExactlyOnceWith(source);
            expect(loadFile).toHaveBeenCalledExactlyOnceWith(materialUrl, expect.any(Function), undefined, undefined, false, expect.any(Function));
            expect(result.byteLength).toBeGreaterThan(0);
            expect(await GetAssetFactsAsync(result)).toMatchObject({ meshCount: 1, primitiveCount: 1 });
        } finally {
            loadFile.mockRestore();
        }
    });

    it("builds a host-root query OBJ URL and resolves its MTL without dropping the host", async () => {
        const source = "https://example.com?format=obj";
        const materialUrl = "https://example.com/model.mtl";
        const loadFile = vi.spyOn(Tools, "LoadFile").mockImplementation((url, onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
            if (url === materialUrl) {
                onSuccess(MTLFixture);
            } else {
                onError?.(undefined, new Error(`Unexpected MTL URL: ${url}`));
            }
            return { abort: () => undefined, onCompleteObservable: new Observable() };
        });
        try {
            const { asset, fetcher } = await CreateUrlPipelineAsync(source, OBJWithMaterialFixture);
            const result = await asset.buildAsync();

            expect(fetcher).toHaveBeenCalledExactlyOnceWith(source);
            expect(loadFile).toHaveBeenCalledExactlyOnceWith(materialUrl, expect.any(Function), undefined, undefined, false, expect.any(Function));
            expect(result.byteLength).toBeGreaterThan(0);
            expect(await GetAssetFactsAsync(result)).toMatchObject({ meshCount: 1, primitiveCount: 1 });
        } finally {
            loadFile.mockRestore();
        }
    });

    it("resolves URL textures relative to the OBJ source folder", async () => {
        const source = "https://example.com/assets/model.obj";
        const materialUrl = "https://example.com/assets/model.mtl";
        const textureUrl = "https://example.com/assets/tiny.png";
        const loadFile = vi.spyOn(Tools, "LoadFile").mockImplementation((url, onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
            if (url === materialUrl) {
                onSuccess(MTLWithUrlTextureFixture);
            } else {
                onError?.(undefined, new Error(`Unexpected MTL URL: ${url}`));
            }
            return { abort: () => undefined, onCompleteObservable: new Observable() };
        });
        const loadFileAsync = vi.spyOn(Tools, "LoadFileAsync").mockImplementation(async (url) => {
            if (url === textureUrl) {
                return ArrayBufferFor(TinyPng);
            }
            throw new Error(`Unexpected texture URL: ${url}`);
        });
        try {
            const { asset } = await CreateUrlPipelineAsync(source, OBJWithUrlTextureFixture);
            const facts = await GetAssetFactsAsync(await asset.buildAsync());

            expect(loadFile).toHaveBeenCalledExactlyOnceWith(materialUrl, expect.any(Function), undefined, undefined, false, expect.any(Function));
            expect(loadFileAsync).toHaveBeenCalledWith(textureUrl);
            expect(facts.textures).toEqual([{ mimeType: "image/png", byteLength: TinyPng.byteLength }]);
        } finally {
            loadFile.mockRestore();
            loadFileAsync.mockRestore();
        }
    });

    it("rejects incoherent direct OBJ source payloads", () => {
        expect(() => new OBJSourceAsset({ path: "fixture.obj", bytes: OBJFixture }, "different.obj", "upload", [])).toThrow(/source identity must match the primary path/);
        expect(() => new OBJSourceAsset({ path: "fixture.txt", bytes: OBJFixture }, "fixture.txt", "upload", [])).toThrow(/uploaded OBJ primary path must end in \.obj/);
        expect(() => new OBJSourceAsset({ path: "fixture.OBJ", bytes: OBJFixture }, "fixture.OBJ", "upload", [])).not.toThrow();
    });

    it("owns immutable companion files and rejects URL companions", () => {
        const companionBytes = MTLBundleFixture.slice();
        const source = new OBJSourceAsset({ path: "fixture.obj", bytes: OBJFixture }, "fixture.obj", "upload", [{ path: "fixture.mtl", bytes: companionBytes }]);
        companionBytes[0] = 0;
        const exposed = source.companions[0];
        exposed.bytes[0] = 0;

        expect(source.companions).toEqual([{ path: "fixture.mtl", bytes: MTLBundleFixture }]);
        expect(Object.isFrozen(source.companions)).toBe(true);
        expect(() => new OBJSourceAsset({ path: "https://example.com/fixture.obj", bytes: OBJFixture }, "https://example.com/fixture.obj", "url", source.companions)).toThrow(
            /URL.*companions/i
        );
    });

    it("builds an uploaded OBJ into a readable GLB and preserves multiple object and group names", async () => {
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            const { asset } = CreatePrimitivePipeline();
            const result = await asset.buildAsync();

            expect(result.byteLength).toBeGreaterThan(0);
            expect(await GetAssetFactsAsync(result)).toMatchObject({
                sceneCount: 1,
                nodes: expect.arrayContaining(["FirstObject", "SecondGroup"]),
                meshCount: 2,
                primitiveCount: 2,
            });
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
        } finally {
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });

    it("round-trips primary and companion bytes, paths, and aggregate behavior offline", async () => {
        const asset = new NodeAsset("aggregate-obj");
        const importer = new ImportOBJAggregateBlock("Import OBJ", asset);
        importer.setUploadedSourceBundle([
            { path: "Models/material.obj", bytes: OBJBundleFixture },
            { path: "Materials/Catalog.MTL", bytes: MTLBundleFixture },
            { path: "Textures/Tiny.PNG", bytes: TinyPng },
        ]);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        importer.output.connectTo(exporter.input);

        expect(importer.inputs).toHaveLength(0);
        expect(importer.outputs).toEqual([importer.output]);
        expect(importer.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(importer.subgraph.attachedBlocks.map((block) => block.getClassName())).toEqual([ReadOBJBlock.ClassName, OBJToUniversalBlock.ClassName]);

        const serialized = asset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportOBJAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [
                    {
                        customType: ReadOBJBlock.ClassName,
                        primary: { path: "Models/material.obj", bytes: expect.any(String) },
                        source: "Models/material.obj",
                        sourceKind: "upload",
                        companions: [
                            { path: "Materials/Catalog.MTL", bytes: expect.any(String) },
                            { path: "Textures/Tiny.PNG", bytes: expect.any(String) },
                        ],
                    },
                    { customType: OBJToUniversalBlock.ClassName },
                ],
            },
        });

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedImporter = parsed.attachedBlocks[0] as ImportOBJAggregateBlock;
        expect(parsedImporter.primary).toEqual({ path: "Models/material.obj", bytes: OBJBundleFixture });
        expect(parsedImporter.source).toBe("Models/material.obj");
        expect(parsedImporter.sourceKind).toBe("upload");
        expect(parsedImporter.companions).toEqual([
            { path: "Materials/Catalog.MTL", bytes: MTLBundleFixture },
            { path: "Textures/Tiny.PNG", bytes: TinyPng },
        ]);
        expect(await GetAssetFactsAsync(await parsed.buildAsync())).toMatchObject({
            nodes: expect.arrayContaining(["MaterialObject", expect.stringMatching(/_mm1$/)]),
            materials: expect.arrayContaining([
                { name: "RedMaterial", baseColorFactor: [0.5, 0, 0, 1], hasBaseColorTexture: false },
                { name: "TexturedMaterial", baseColorFactor: [0, 0.5, 0, 1], hasBaseColorTexture: true },
            ]),
            textures: [{ mimeType: "image/png", byteLength: TinyPng.byteLength }],
        });
    });

    it("rejects invalid or ambiguous bundles without replacing the active source", async () => {
        const { read } = CreateBundlePipeline();
        const expectedPrimary = read.primary;
        const expectedCompanions = read.companions;
        const invalidBundles: ReadonlyArray<ReadonlyArray<{ readonly path: string; readonly bytes: Uint8Array }>> = [
            [{ path: "material.mtl", bytes: MTLBundleFixture }],
            [
                { path: "first.obj", bytes: OBJFixture },
                { path: "second.OBJ", bytes: OBJFixture },
            ],
            [
                { path: "fixture.obj", bytes: OBJFixture },
                { path: "notes.txt", bytes: new TextEncoder().encode("unsupported") },
            ],
            [
                { path: "fixture.obj", bytes: OBJFixture },
                { path: "Materials/material.mtl", bytes: MTLBundleFixture },
                { path: "materials/MATERIAL.MTL", bytes: MTLBundleFixture },
            ],
            [
                { path: "fixture.obj", bytes: OBJFixture },
                { path: "First/material.mtl", bytes: MTLBundleFixture },
                { path: "Second/material.mtl", bytes: MTLBundleFixture },
            ],
            [
                { path: "../fixture.obj", bytes: OBJFixture },
                { path: "material.mtl", bytes: MTLBundleFixture },
            ],
            [
                { path: "/fixture.obj", bytes: OBJFixture },
                { path: "material.mtl", bytes: MTLBundleFixture },
            ],
        ];

        for (const files of invalidBundles) {
            expect(() => read.setUploadedSourceBundle(files)).toThrow(/Read OBJ.*bundle/i);
            expect(read.primary).toEqual(expectedPrimary);
            expect(read.companions).toEqual(expectedCompanions);
        }

        await expect(
            read.setUploadedSourceBundleAsync(async () => {
                throw new Error("Injected bundle read failure");
            })
        ).rejects.toThrow(/Injected bundle read failure/);
        expect(read.primary).toEqual(expectedPrimary);
        expect(read.companions).toEqual(expectedCompanions);
    });

    it("does not let an older bundle replace a newer successful source", async () => {
        const asset = new NodeAsset("obj-bundle-race");
        const read = new ReadOBJBlock("Read OBJ", asset);
        let resolveBundle: ((files: ReadonlyArray<{ readonly path: string; readonly bytes: Uint8Array }>) => void) | undefined;
        const pendingBundle = read.setUploadedSourceBundleAsync(
            async () =>
                await new Promise((resolve) => {
                    resolveBundle = resolve;
                })
        );

        read.setUploadedSource(OBJFixture, "newer.obj");
        resolveBundle?.([{ path: "older.obj", bytes: new Uint8Array([1, 2, 3]) }]);
        await pendingBundle;

        expect(read.source).toBe("newer.obj");
        expect(read.primary?.bytes).toEqual(OBJFixture);
        expect(read.companions).toEqual([]);
    });

    it("builds case-insensitive relative companions with materials, an _mmN split, and an embedded texture", async () => {
        const { asset } = CreateBundlePipeline();
        const facts = await GetAssetFactsAsync(await asset.buildAsync());

        expect(facts.nodes).toEqual(expect.arrayContaining(["MaterialObject", expect.stringMatching(/_mm1$/)]));
        expect(facts.materials).toEqual(
            expect.arrayContaining([
                { name: "RedMaterial", baseColorFactor: [0.5, 0, 0, 1], hasBaseColorTexture: false },
                { name: "TexturedMaterial", baseColorFactor: [0, 0.5, 0, 1], hasBaseColorTexture: true },
            ])
        );
        expect(facts.textures).toEqual([{ mimeType: "image/png", byteLength: TinyPng.byteLength }]);
    });

    it("uses unambiguous basename fallback for ordinary flat browser references", async () => {
        const { asset } = CreateNamedBundlePipeline("FallbackMaterial", "1.0 0.0 0.0", TinyPng);
        const facts = await GetAssetFactsAsync(await asset.buildAsync());

        expect(facts.materials).toEqual(expect.arrayContaining([{ name: "FallbackMaterial", baseColorFactor: [0.5, 0, 0, 1], hasBaseColorTexture: true }]));
        expect(facts.textures).toEqual([{ mimeType: "image/png", byteLength: TinyPng.byteLength }]);
    });

    it("isolates concurrent same-name bundles and cleans every scoped entry", async () => {
        const initialStore = { ...FilesInputStore.FilesToLoad };
        const first = CreateNamedBundlePipeline("FirstMaterial", "1.0 0.0 0.0", TinyPng);
        const second = CreateNamedBundlePipeline("SecondMaterial", "0.0 0.0 1.0", TinyPngWithTrailingByte);

        const [firstFacts, secondFacts] = await Promise.all([first.asset.buildAsync().then(GetAssetFactsAsync), second.asset.buildAsync().then(GetAssetFactsAsync)]);

        expect(firstFacts.materials.map((material) => material.name)).toContain("FirstMaterial");
        expect(firstFacts.materials.map((material) => material.name)).not.toContain("SecondMaterial");
        expect(firstFacts.textures).toEqual([{ mimeType: "image/png", byteLength: TinyPng.byteLength }]);
        expect(secondFacts.materials.map((material) => material.name)).toContain("SecondMaterial");
        expect(secondFacts.materials.map((material) => material.name)).not.toContain("FirstMaterial");
        expect(secondFacts.textures).toEqual([{ mimeType: "image/png", byteLength: TinyPngWithTrailingByte.byteLength }]);
        expect(FilesInputStore.FilesToLoad).toEqual(initialStore);
    });

    it("activates URLs only after success and keeps the last successful source on failure", async () => {
        const asset = new NodeAsset("obj-source-choice");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(OBJFixture, "uploaded.obj");

        await expect(
            read.setUrlAsync("https://example.invalid/missing.obj", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/Could not load OBJ.*404 Not Found/);
        expect(read.source).toBe("uploaded.obj");
        expect(read.sourceKind).toBe("upload");

        const remote = new TextEncoder().encode(new TextDecoder().decode(OBJFixture).replace("FirstObject", "RemoteObject"));
        await read.setUrlAsync("https://cdn.example.com/assets/remote.obj?version=1", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(remote),
        }));

        expect(read.primary).toEqual({ path: "https://cdn.example.com/assets/remote.obj?version=1", bytes: remote });
        expect(read.source).toBe("https://cdn.example.com/assets/remote.obj?version=1");
        expect(read.sourceKind).toBe("url");
        expect(read.companions).toEqual([]);
    });

    it("does not let an older URL replace a newer upload or a cleared source", async () => {
        const asset = new NodeAsset("obj-source-race");
        const read = new ReadOBJBlock("Read OBJ", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = read.setUrlAsync(
            "https://example.com/remote.obj",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.setUploadedSource(OBJFixture, "uploaded.obj");
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(new Uint8Array([1, 2, 3])),
        });
        await pendingUrl;
        expect(read.source).toBe("uploaded.obj");
        expect(read.primary?.bytes).toEqual(OBJFixture);

        const pendingAfterClear = read.setUrlAsync(
            "https://example.com/cleared.obj",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.clearSource();
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(new Uint8Array([4, 5, 6])),
        });
        await pendingAfterClear;
        expect(read.primary).toBeNull();
        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
        expect(read.companions).toEqual([]);
    });

    it("rejects invalid uploads without replacing the active source and owns defensive copies", () => {
        const source = OBJFixture.slice();
        const asset = new NodeAsset("obj-upload-validation");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(source, "valid.OBJ");
        source[0] = 0;

        const exposed = read.primary;
        if (!exposed) {
            throw new Error("Expected an active OBJ primary.");
        }
        exposed.bytes[0] = 0;
        expect(read.primary?.bytes).toEqual(OBJFixture);
        expect(() => read.setUploadedSource(new Uint8Array([1]), "not-obj.txt")).toThrow(/single \.obj file/i);
        expect(read.source).toBe("valid.OBJ");
        expect(read.primary?.bytes).toEqual(OBJFixture);
    });

    it("rejects malformed or incoherent persisted OBJ state contextually", () => {
        const asset = new NodeAsset("obj-persistence-validation");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(OBJFixture, "fixture.obj");
        const serialized = asset.serialize();

        const invalidStates: Array<(block: Record<string, unknown>) => void> = [
            (block) => {
                block.primary = null;
            },
            (block) => {
                block.sourceKind = "clipboard";
            },
            (block) => {
                block.primary = { path: "fixture.obj", bytes: "***not-base64***" };
            },
            (block) => {
                block.companions = [{ path: "future.txt", bytes: "" }];
            },
            (block) => {
                delete block.companions;
            },
            (block) => {
                block.primary = { path: "fixture.txt", bytes: "" };
            },
            (block) => {
                block.source = "different.obj";
            },
        ];

        for (const invalidate of invalidStates) {
            const candidate = JSON.parse(JSON.stringify(serialized)) as { blocks: Array<Record<string, unknown>> };
            invalidate(candidate.blocks[0]);
            expect(() => NodeAsset.Parse(candidate)).toThrow(/Read OBJ.*persisted OBJ source state/);
        }
    });

    it("accounts OBJ bytes before parsing", async () => {
        const { asset } = CreatePrimitivePipeline();
        await expect(asset.buildAsync({ limits: { maxSourceAssetBytes: OBJFixture.byteLength - 1 } })).rejects.toMatchObject({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
        });
    });

    it("accounts companion bytes before parsing", async () => {
        const { asset } = CreateBundlePipeline();
        await expect(
            asset.buildAsync({
                limits: { maxSourceAssetBytes: OBJBundleFixture.byteLength + MTLBundleFixture.byteLength + TinyPng.byteLength - 1 },
            })
        ).rejects.toMatchObject({ code: "NODE_ASSET_LIMIT_SOURCE_BYTES" });
    });

    it("preserves the loader's silent missing-MTL fallback and succeeds geometry-only", async () => {
        const source = new TextEncoder().encode(`mtllib unavailable.mtl
${new TextDecoder().decode(OBJFixture)}`);
        const loadFile = vi.spyOn(Tools, "LoadFile").mockImplementation((_url, _onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
            onError?.(undefined, new Error("Unavailable synthetic MTL"));
            return { abort: () => undefined, onCompleteObservable: new Observable() };
        });
        try {
            const { asset } = CreatePrimitivePipeline(source, "missing-material.obj");
            const result = await asset.buildAsync();
            expect(await GetAssetFactsAsync(result)).toMatchObject({ meshCount: 2 });
            expect(result.diagnostics).toEqual([]);
            expect(loadFile).toHaveBeenCalledWith(
                expect.stringMatching(/^file:node-assets-obj-\d+\/unavailable\.mtl$/),
                expect.any(Function),
                undefined,
                undefined,
                false,
                expect.any(Function)
            );
        } finally {
            loadFile.mockRestore();
        }
    });

    it("disposes its scene and engine when an injected export failure rejects", async () => {
        const asset = new NodeAsset("obj-cleanup");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSourceBundle([
            { path: "fixture.obj", bytes: OBJFixture },
            { path: "material.mtl", bytes: MTLBundleFixture },
        ]);
        const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
        await read._buildBlockAsync();
        transcoder.input.value = read.output.value;

        const exportFailure = vi.spyOn(GLTF2Export, "GLBAsync").mockImplementationOnce(async () => {
            expect(Object.keys(FilesInputStore.FilesToLoad).some((key) => key.startsWith("node-assets-obj-"))).toBe(true);
            throw new Error("Injected OBJ export failure");
        });
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        const initialStore = { ...FilesInputStore.FilesToLoad };
        try {
            await expect(transcoder._buildBlockAsync()).rejects.toThrow(/OBJ to Universal.*Injected OBJ export failure/);
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
            expect(FilesInputStore.FilesToLoad).toEqual(initialStore);
        } finally {
            exportFailure.mockRestore();
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });
});
