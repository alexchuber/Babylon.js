import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompositeImageBlock } from "../../src/Blocks/compositeImageBlock";
import { ExportImageBlock } from "../../src/Blocks/exportImageBlock";
import { type ImageCanvasOperation } from "../../src/Blocks/imageCanvas";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// CompositeImage touches a real canvas only through the shared `imageCanvas` helper, whose
// createImageBitmap/OffscreenCanvas path is unavailable in this headless (Node) environment. Stubbing
// that single seam lets the block build here so its port wiring, the operation it delegates, and the
// output metadata (dimensions / mime type) can be asserted without a browser. The stub echoes the
// requested operation into the produced payload, mirroring the real decode -> draw -> encode contract,
// so real pixel correctness (the overlay actually landing at the offset) is left to the editor
// Playwright (browser) seam while the metadata split asserted here runs headless.
const { processImageMock } = vi.hoisted(() => ({ processImageMock: vi.fn() }));
vi.mock("../../src/Blocks/imageCanvas", () => ({ ProcessImageAsync: processImageMock }));

const BaseBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 1, 1, 1]);
const OverlayBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2, 2, 2, 2]);

/**
 * Wires an ImportImage source for the base and one for the overlay, both carrying fixture bytes, so a
 * composite block under test has two inputs to build from.
 * @param baseMime - The base image's mime type.
 * @param overlayMime - The overlay image's mime type.
 * @returns The owning asset and the two import blocks.
 */
function CreateImports(baseMime = "image/png", overlayMime = "image/jpeg"): { asset: NodeAsset; base: ImportImageBlock; overlay: ImportImageBlock } {
    const asset = new NodeAsset("composite-ops");
    const base = new ImportImageBlock("import-base", asset);
    base.data = BaseBytes;
    base.mimeType = baseMime;
    const overlay = new ImportImageBlock("import-overlay", asset);
    overlay.data = OverlayBytes;
    overlay.mimeType = overlayMime;
    return { asset, base, overlay };
}

describe("CompositeImage block", () => {
    beforeEach(() => {
        processImageMock.mockReset();
        // Echo the operation into a fresh payload: the output size and mime follow the base payload
        // (composite never overrides width/height/mimeType), mirroring the real helper's contract.
        processImageMock.mockImplementation(async (payload: ImagePayload, operation: ImageCanvasOperation): Promise<ImagePayload> => {
            return {
                data: new Uint8Array([0xff, 0x00, 0xff]),
                mimeType: operation.mimeType ?? payload.mimeType,
                width: operation.width ?? payload.width,
                height: operation.height ?? payload.height,
            };
        });
    });

    it("exposes two IMAGE inputs (base, overlay) and one IMAGE output", () => {
        const asset = new NodeAsset("ports");
        const composite = new CompositeImageBlock("composite", asset);
        expect(composite.inputs).toHaveLength(2);
        expect(composite.outputs).toHaveLength(1);
        expect(composite.base.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(composite.overlay.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(composite.output.type).toBe(NodeAssetConnectionPointType.IMAGE);
        // The inputs are registered in (base, overlay) order.
        expect(composite.inputs[0]).toBe(composite.base);
        expect(composite.inputs[1]).toBe(composite.overlay);
    });

    it("delegates the overlay payload and offset to the canvas helper, leaving size and mime to the base", async () => {
        const { asset, base, overlay } = CreateImports();
        const composite = new CompositeImageBlock("composite", asset);
        composite.offsetX = 12;
        composite.offsetY = 34;
        const exporter = new ExportImageBlock("export", asset);
        base.output.connectTo(composite.base);
        overlay.output.connectTo(composite.overlay);
        composite.output.connectTo(exporter.input);

        await asset.buildAsync();

        expect(processImageMock).toHaveBeenCalledTimes(1);
        // The base payload is the redraw source; the overlay + offset ride along as the composite op.
        expect(processImageMock.mock.calls[0][0]).toMatchObject({ data: BaseBytes, mimeType: "image/png" });
        // Exact-equality proves nothing else is delegated: no width/height/mimeType override, so the
        // output size and mime are left to follow the base.
        expect(processImageMock.mock.calls[0][1]).toEqual({
            composite: { overlay: { data: OverlayBytes, mimeType: "image/jpeg" }, offsetX: 12, offsetY: 34 },
        });
    });

    it("outputs dimensions and mime type that follow the base, not the overlay", async () => {
        const asset = new NodeAsset("metadata");
        const composite = new CompositeImageBlock("composite", asset);
        // Feed known-size payloads straight onto the inputs so the (mocked) helper can echo base dims.
        composite.base.value = { data: BaseBytes, mimeType: "image/png", width: 200, height: 120 } as ImagePayload;
        composite.overlay.value = { data: OverlayBytes, mimeType: "image/jpeg", width: 40, height: 30 } as ImagePayload;

        await composite._buildBlockAsync();

        const output = composite.output.value as ImagePayload;
        expect(output.width).toBe(200);
        expect(output.height).toBe(120);
        expect(output.mimeType).toBe("image/png");
    });

    it("throws a clear error when the base or the overlay image is missing", async () => {
        const asset = new NodeAsset("missing");

        const missingOverlay = new CompositeImageBlock("missing-overlay", asset);
        missingOverlay.base.value = { data: BaseBytes, mimeType: "image/png" } as ImagePayload;
        await expect(missingOverlay._buildBlockAsync()).rejects.toThrow(/no overlay image to composite/);

        const missingBase = new CompositeImageBlock("missing-base", asset);
        missingBase.overlay.value = { data: OverlayBytes, mimeType: "image/jpeg" } as ImagePayload;
        await expect(missingBase._buildBlockAsync()).rejects.toThrow(/no base image to composite/);

        // No canvas work is attempted when an input is missing.
        expect(processImageMock).not.toHaveBeenCalled();
    });

    it("emits a brand-new payload without mutating either shared input payload", async () => {
        const { asset, base, overlay } = CreateImports();
        const composite = new CompositeImageBlock("composite", asset);
        const exporter = new ExportImageBlock("export", asset);
        base.output.connectTo(composite.base);
        overlay.output.connectTo(composite.overlay);
        composite.output.connectTo(exporter.input);

        await asset.buildAsync();

        const baseInput = processImageMock.mock.calls[0][0] as ImagePayload;
        const overlayInput = (processImageMock.mock.calls[0][1] as ImageCanvasOperation).composite!.overlay;
        const output = await (processImageMock.mock.results[0].value as Promise<ImagePayload>);
        expect(output).not.toBe(baseInput);
        expect(output).not.toBe(overlayInput);
        expect(output.data).not.toBe(baseInput.data);
        // Both source byte buffers are left intact for any other consumer sharing them by reference.
        expect(baseInput.data).toEqual(BaseBytes);
        expect(overlayInput.data).toEqual(OverlayBytes);
    });

    it("builds an ImportImage(base) + ImportImage(overlay) -> CompositeImage -> ExportImage chain", async () => {
        const { asset, base, overlay } = CreateImports("image/webp");
        const composite = new CompositeImageBlock("composite", asset);
        composite.offsetX = 5;
        composite.offsetY = 7;
        const exporter = new ExportImageBlock("export", asset);
        base.output.connectTo(composite.base);
        overlay.output.connectTo(composite.overlay);
        composite.output.connectTo(exporter.input);

        const result = await asset.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(processImageMock).toHaveBeenCalledTimes(1);
        // The exported bytes are the composited payload's bytes, and its mime follows the base.
        const output = await (processImageMock.mock.results[0].value as Promise<ImagePayload>);
        expect(result).toBe(output.data);
        expect(output.mimeType).toBe("image/webp");
    });

    it("round-trips its offset params through serialize/Parse (proving self-registration)", () => {
        const asset = new NodeAsset("params");
        const composite = new CompositeImageBlock("composite", asset);
        composite.offsetX = -8;
        composite.offsetY = 99;

        // Parse rebuilds via the registry, so a successful reconstruction also proves the block
        // self-registered its factory at import time.
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const [parsedComposite] = parsed.attachedBlocks as [CompositeImageBlock];

        expect(parsedComposite).toBeInstanceOf(CompositeImageBlock);
        expect(parsedComposite.offsetX).toBe(-8);
        expect(parsedComposite.offsetY).toBe(99);
    });
});
