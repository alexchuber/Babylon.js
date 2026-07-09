import { describe, expect, it, beforeEach, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { NodeAsset } from "../../src/nodeAsset";

const mocks = vi.hoisted(() => {
    const document = { asset: "document" };
    const webIOInstances: MockWebIO[] = [];

    class MockWebIO {
        public dependencies: Record<string, unknown> | undefined;

        public constructor() {
            webIOInstances.push(this);
        }

        public registerExtensions(): this {
            return this;
        }

        public registerDependencies(dependencies: Record<string, unknown>): this {
            this.dependencies = dependencies;
            return this;
        }

        public async readBinary(): Promise<unknown> {
            return document;
        }

        public async writeBinary(): Promise<Uint8Array> {
            return new Uint8Array([1, 2, 3]);
        }
    }

    const draco3d = {
        createDecoderModule: vi.fn(async () => ({ decoder: true })),
        createEncoderModule: vi.fn(async () => ({ encoder: true })),
    };

    return {
        createDecoderModule: draco3d.createDecoderModule,
        createEncoderModule: draco3d.createEncoderModule,
        document,
        draco3d,
        MockWebIO,
        webIOInstances,
    };
});

vi.mock("@gltf-transform/core", () => ({
    WebIO: mocks.MockWebIO,
}));

vi.mock("@gltf-transform/extensions", () => ({
    ALL_EXTENSIONS: [],
}));

vi.mock("draco3dgltf", () => ({
    ...mocks.draco3d,
    default: mocks.draco3d,
}));

describe("Draco wasm location injection", () => {
    beforeEach(() => {
        mocks.createDecoderModule.mockClear();
        mocks.createEncoderModule.mockClear();
        mocks.webIOInstances.length = 0;
    });

    it("imports glTF using the injected Draco decoder wasm URL", async () => {
        const importer = new ImportGLTFBlock("import", new NodeAsset("import"));
        importer.data = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
        importer.dracoDecoderWasmUrl = "/assets/draco_decoder_gltf.wasm";

        await importer._buildBlockAsync();

        const options = mocks.createDecoderModule.mock.calls[0][0] as { locateFile: (path: string, prefix: string) => string };
        expect(options.locateFile("draco_decoder_gltf.wasm", "/fallback/")).toBe("/assets/draco_decoder_gltf.wasm");
        expect(importer.output.value).toBe(mocks.document);
        expect(mocks.webIOInstances[0].dependencies).toEqual({ "draco3d.decoder": { decoder: true } });
    });

    it("exports glTF using the injected Draco encoder wasm URL", async () => {
        const exporter = new ExportGLTFBlock("export", new NodeAsset("export"));
        exporter.input.value = mocks.document;
        exporter.dracoEncoderWasmUrl = "/assets/draco_encoder.wasm";

        await exporter._buildBlockAsync();

        const options = mocks.createEncoderModule.mock.calls[0][0] as { locateFile: (path: string, prefix: string) => string };
        expect(options.locateFile("draco_encoder.wasm", "/fallback/")).toBe("/assets/draco_encoder.wasm");
        expect(exporter.result).toEqual(new Uint8Array([1, 2, 3]));
        expect(mocks.webIOInstances[0].dependencies).toEqual({ "draco3d.encoder": { encoder: true } });
    });
});
