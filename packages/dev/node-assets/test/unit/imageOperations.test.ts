import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConvertImageFormatBlock } from "../../src/Blocks/convertImageFormatBlock";
import { ExportImageBlock } from "../../src/Blocks/exportImageBlock";
import { FlipImageBlock } from "../../src/Blocks/flipImageBlock";
import { type ImageCanvasOperation } from "../../src/Blocks/imageCanvas";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { ResizeImageBlock } from "../../src/Blocks/resizeImageBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// The image ops touch a real canvas only through the shared `imageCanvas` helper, whose
// `createImageBitmap`/`OffscreenCanvas` path is unavailable in this headless (Node) environment.
// Stubbing that single seam lets the ops build here so the wiring, the operation each op delegates,
// and the output metadata (dimensions / mime type) can be asserted without a browser. The stub
// echoes the requested operation into the produced payload — exactly the contract the real helper
// fulfills — so pixel-level correctness (mirroring, valid re-encode) is left to the editor Playwright
// seam while the metadata split asserted here runs headless.
const { processImageMock } = vi.hoisted(() => ({ processImageMock: vi.fn() }));
vi.mock("../../src/Blocks/imageCanvas", () => ({ ProcessImageAsync: processImageMock }));

const SourceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/**
 * Wires an ImportImage source carrying the fixture bytes so an op under test has an input to build.
 * @param mimeType - The source image's mime type.
 * @returns The owning asset and the import block.
 */
function CreateImport(mimeType = "image/png"): { asset: NodeAsset; importer: ImportImageBlock } {
    const asset = new NodeAsset("image-ops");
    const importer = new ImportImageBlock("import", asset);
    importer.data = SourceBytes;
    importer.mimeType = mimeType;
    return { asset, importer };
}

describe("single-input image operations", () => {
    beforeEach(() => {
        processImageMock.mockReset();
        // Echo the operation into a fresh payload: apply the requested size/mime, otherwise fall back
        // to the source's, mirroring what a real decode -> redraw -> encode produces.
        processImageMock.mockImplementation(async (payload: ImagePayload, operation: ImageCanvasOperation): Promise<ImagePayload> => {
            return {
                data: new Uint8Array([0xff, operation.flipHorizontal ? 1 : 0, operation.flipVertical ? 1 : 0]),
                mimeType: operation.mimeType ?? payload.mimeType,
                width: operation.width ?? payload.width,
                height: operation.height ?? payload.height,
            };
        });
    });

    it("exposes exactly one IMAGE input and one IMAGE output on each op", () => {
        const asset = new NodeAsset("ports");
        const ops = [new ResizeImageBlock("resize", asset), new ConvertImageFormatBlock("convert", asset), new FlipImageBlock("flip", asset)];
        for (const op of ops) {
            expect(op.inputs).toHaveLength(1);
            expect(op.outputs).toHaveLength(1);
            expect(op.inputs[0].type).toBe(NodeAssetConnectionPointType.IMAGE);
            expect(op.outputs[0].type).toBe(NodeAssetConnectionPointType.IMAGE);
        }
    });

    it("resizes to the target dimensions and delegates only them to the canvas helper", async () => {
        const { asset, importer } = CreateImport();
        const resize = new ResizeImageBlock("resize", asset);
        resize.width = 100;
        resize.height = 50;
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(resize.input);
        resize.output.connectTo(exporter.input);

        await asset.buildAsync();

        expect(processImageMock).toHaveBeenCalledTimes(1);
        expect(processImageMock.mock.calls[0][0]).toBe(importer.output.value);
        expect(processImageMock.mock.calls[0][1]).toEqual({ width: 100, height: 50 });

        const output = resize.output.value as ImagePayload;
        expect(output.width).toBe(100);
        expect(output.height).toBe(50);
        // Resize preserves the source format.
        expect(output.mimeType).toBe("image/png");
    });

    it("converts the format and delegates the target mime type and quality", async () => {
        const { asset, importer } = CreateImport();
        const convert = new ConvertImageFormatBlock("convert", asset);
        convert.format = "jpeg";
        convert.quality = 0.8;
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(convert.input);
        convert.output.connectTo(exporter.input);

        await asset.buildAsync();

        expect(processImageMock).toHaveBeenCalledTimes(1);
        expect(processImageMock.mock.calls[0][1]).toEqual({ mimeType: "image/jpeg", quality: 0.8 });
        expect((convert.output.value as ImagePayload).mimeType).toBe("image/jpeg");
    });

    it.each([
        { axis: "horizontal", expected: { flipHorizontal: true, flipVertical: false } },
        { axis: "vertical", expected: { flipHorizontal: false, flipVertical: true } },
    ] as const)("flips on the $axis axis, preserving the source format", async ({ axis, expected }) => {
        const { asset, importer } = CreateImport("image/webp");
        const flip = new FlipImageBlock("flip", asset);
        flip.axis = axis;
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(flip.input);
        flip.output.connectTo(exporter.input);

        await asset.buildAsync();

        expect(processImageMock).toHaveBeenCalledTimes(1);
        expect(processImageMock.mock.calls[0][1]).toEqual(expected);
        // Flip changes neither the format nor (with no resize) the dimensions.
        expect((flip.output.value as ImagePayload).mimeType).toBe("image/webp");
    });

    it("throws a clear error when an op has no input image", async () => {
        const asset = new NodeAsset("no-input");
        const resize = new ResizeImageBlock("resize", asset);
        const convert = new ConvertImageFormatBlock("convert", asset);
        const flip = new FlipImageBlock("flip", asset);

        await expect(resize._buildBlockAsync()).rejects.toThrow(/no input image to resize/);
        await expect(convert._buildBlockAsync()).rejects.toThrow(/no input image to convert/);
        await expect(flip._buildBlockAsync()).rejects.toThrow(/no input image to flip/);
        // No canvas work is attempted when the input is missing.
        expect(processImageMock).not.toHaveBeenCalled();
    });

    it("emits a brand-new payload without mutating the shared input payload", async () => {
        const { asset, importer } = CreateImport();
        const flip = new FlipImageBlock("flip", asset);
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(flip.input);
        flip.output.connectTo(exporter.input);

        await asset.buildAsync();

        const input = importer.output.value as ImagePayload;
        const output = flip.output.value as ImagePayload;
        expect(output).not.toBe(input);
        expect(output.data).not.toBe(input.data);
        // The source bytes are left intact for any other consumer sharing them by reference.
        expect(input.data).toEqual(SourceBytes);
    });

    it("builds an Import -> Resize -> Convert -> Export chain with resized dimensions and converted mime", async () => {
        const { asset, importer } = CreateImport();
        const resize = new ResizeImageBlock("resize", asset);
        resize.width = 120;
        resize.height = 30;
        const convert = new ConvertImageFormatBlock("convert", asset);
        convert.format = "webp";
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(resize.input);
        resize.output.connectTo(convert.input);
        convert.output.connectTo(exporter.input);

        const result = await asset.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(processImageMock).toHaveBeenCalledTimes(2);

        // The resize sets the dimensions; the later convert preserves them while changing the format.
        const output = convert.output.value as ImagePayload;
        expect(output.width).toBe(120);
        expect(output.height).toBe(30);
        expect(output.mimeType).toBe("image/webp");
    });

    it("round-trips each op's build-affecting params through serialize/Parse", () => {
        const asset = new NodeAsset("params");
        const resize = new ResizeImageBlock("resize", asset);
        resize.width = 123;
        resize.height = 45;
        const convert = new ConvertImageFormatBlock("convert", asset);
        convert.format = "webp";
        convert.quality = 0.5;
        const flip = new FlipImageBlock("flip", asset);
        flip.axis = "vertical";

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const [parsedResize, parsedConvert, parsedFlip] = parsed.attachedBlocks as [ResizeImageBlock, ConvertImageFormatBlock, FlipImageBlock];

        expect(parsedResize.width).toBe(123);
        expect(parsedResize.height).toBe(45);
        expect(parsedConvert.format).toBe("webp");
        expect(parsedConvert.quality).toBe(0.5);
        expect(parsedFlip.axis).toBe("vertical");
    });
});
