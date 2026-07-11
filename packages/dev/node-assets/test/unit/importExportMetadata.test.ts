import { describe, expect, it } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAsset } from "../../src/nodeAsset";

/**
 * Roundtrips a node asset through serialize/Parse (via JSON so it mirrors an editor save/load), then
 * returns the parsed asset's blocks for assertions.
 * @param asset - The asset to roundtrip.
 * @returns The parsed asset.
 */
function RoundtripAsset(asset: NodeAsset): NodeAsset {
    const serialized = JSON.parse(JSON.stringify(asset.serialize()));
    return NodeAsset.Parse(serialized);
}

describe("Import/Export source & name metadata", () => {
    it("defaults the glTF import source to null and roundtrips its value", () => {
        const asset = new NodeAsset("gltf-source");
        const block = new ImportGLTFBlock("import", asset);
        expect(block.source).toBeNull();

        block.data = new Uint8Array([1, 2, 3, 4]);
        block.source = "https://example.com/model.glb";

        const parsed = RoundtripAsset(asset).attachedBlocks[0] as ImportGLTFBlock;
        expect(parsed.source).toBe("https://example.com/model.glb");
        expect(parsed.data).toEqual(block.data);
    });

    it("defaults the image import source to null and roundtrips its value alongside the mime type", () => {
        const asset = new NodeAsset("image-source");
        const block = new ImportImageBlock("import", asset);
        expect(block.source).toBeNull();

        block.data = new Uint8Array([9, 8, 7]);
        block.mimeType = "image/jpeg";
        block.source = "photo.jpg";

        const parsed = RoundtripAsset(asset).attachedBlocks[0] as ImportImageBlock;
        expect(parsed.source).toBe("photo.jpg");
        expect(parsed.mimeType).toBe("image/jpeg");
        expect(parsed.data).toEqual(block.data);
    });

    it('defaults the glTF export file name to "scene" and keeps it out of the serialized graph', () => {
        const asset = new NodeAsset("export-name");
        const block = new ExportGLTFBlock("export", asset);
        expect(block.fileName).toBe("scene");

        block.fileName = "myScene";

        // The export file name is editor-owned download metadata, so it must not leak into the domain
        // serialization (which feeds the editor's build-relevant signature).
        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        expect(JSON.stringify(serialized)).not.toContain("myScene");
    });
});
