import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { Selector } from "../../src/Blocks/selector";
import { StringLiteral } from "../../src/Blocks/stringLiteral";

describe("Selector", () => {
    it("registers one optional STRING override input and one STRING output", () => {
        const asset = new NodeAsset("shape");
        const selector = new Selector("sel", asset);

        expect(asset.attachedBlocks).toContain(selector);
        expect(selector.inputs).toHaveLength(1);
        expect(selector.outputs).toHaveLength(1);
        expect(selector.pointerOverride).toBe(selector.inputs[0]);
        expect(selector.pointerOverride.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(selector.pointerOverride.isOptional).toBe(true);
        expect(selector.output).toBe(selector.outputs[0]);
        expect(selector.output.type).toBe(NodeAssetConnectionPointType.STRING);
    });

    it("emits the stored pointer when the override is not connected", async () => {
        const asset = new NodeAsset("stored");
        const selector = new Selector("sel", asset);
        selector.pointer = "/nodes/0/translation";

        await selector._buildBlockAsync();

        expect(selector.pointerOverride.isConnected).toBe(false);
        expect(selector.output.value).toBe("/nodes/0/translation");
    });

    it("prefers the connected override over the stored pointer", async () => {
        const asset = new NodeAsset("override");
        const literal = new StringLiteral("lit", asset);
        literal.value = "/materials/0/emissiveFactor";
        const selector = new Selector("sel", asset);
        selector.pointer = "/nodes/0/translation";

        literal.output.connectTo(selector.pointerOverride);
        // Mirror how buildAsync propagates an upstream output onto the connected input.
        await literal._buildBlockAsync();
        selector.pointerOverride.value = literal.output.value;

        await selector._buildBlockAsync();

        expect(selector.output.value).toBe("/materials/0/emissiveFactor");
    });

    it("accepts a well-formed nested pointer without throwing", async () => {
        const asset = new NodeAsset("well-formed");
        const selector = new Selector("sel", asset);
        selector.pointer = "/materials/2/pbrMetallicRoughness/baseColorFactor";

        await selector._buildBlockAsync();

        expect(selector.output.value).toBe("/materials/2/pbrMetallicRoughness/baseColorFactor");
    });

    describe("shape validation", () => {
        const Malformed: ReadonlyArray<{ readonly title: string; readonly pointer: string }> = [
            { title: "missing the leading slash", pointer: "nodes/0/translation" },
            { title: "an empty interior segment", pointer: "/nodes//translation" },
            { title: "a trailing slash (empty final segment)", pointer: "/nodes/0/" },
            { title: "the empty string", pointer: "" },
            { title: "only a slash", pointer: "/" },
        ];

        it.each(Malformed)("rejects a pointer with $title", async ({ pointer }) => {
            const asset = new NodeAsset("malformed");
            const selector = new Selector("sel", asset);
            selector.pointer = pointer;

            await expect(selector._buildBlockAsync()).rejects.toThrow(/malformed/);
        });

        it("names the block and the bad pointer in the error", async () => {
            const asset = new NodeAsset("named-error");
            const selector = new Selector("mySelector", asset);
            selector.pointer = "nodes/0/translation";

            await expect(selector._buildBlockAsync()).rejects.toThrow("mySelector");
            await expect(selector._buildBlockAsync()).rejects.toThrow('"nodes/0/translation"');
        });

        it("validates the override rather than the stored pointer when connected", async () => {
            const asset = new NodeAsset("override-validation");
            const literal = new StringLiteral("lit", asset);
            literal.value = "nodes/0/translation"; // malformed override
            const selector = new Selector("sel", asset);
            selector.pointer = "/nodes/0/translation"; // well-formed stored pointer

            literal.output.connectTo(selector.pointerOverride);
            await literal._buildBlockAsync();
            selector.pointerOverride.value = literal.output.value;

            await expect(selector._buildBlockAsync()).rejects.toThrow(/malformed/);
        });
    });

    it("round-trips its pointer and identity through save/load", () => {
        const asset = new NodeAsset("roundtrip");
        const selector = new Selector("sel", asset);
        selector.pointer = "/materials/0/emissiveFactor";

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // Parse rebuilds via the registry, so a successful reconstruction also proves the block
        // self-registered its factory at import time.
        expect(parsed.attachedBlocks).toHaveLength(1);
        const restored = parsed.attachedBlocks[0] as Selector;
        expect(restored.getClassName()).toBe(Selector.ClassName);
        expect(restored.pointer).toBe("/materials/0/emissiveFactor");
    });
});
