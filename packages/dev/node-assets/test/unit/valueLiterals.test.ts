import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { JsonLiteral } from "../../src/Blocks/jsonLiteral";
import { NumberLiteral } from "../../src/Blocks/numberLiteral";
import { StringLiteral } from "../../src/Blocks/stringLiteral";

type LiteralBlock = NumberLiteral | StringLiteral | JsonLiteral;

/**
 * A minimal consumer with one input of each scalar kind, used only to exercise `connectTo`
 * kind-equality. It is never registered or parsed, so it never touches the block registry.
 */
class ScalarConsumer extends NodeAssetBlock {
    public static override ClassName = "ScalarConsumer_test";

    public readonly scene = this._registerInput("scene", NodeAssetConnectionPointType.SCENE);
    public readonly number = this._registerInput("number", NodeAssetConnectionPointType.NUMBER);
    public readonly string = this._registerInput("string", NodeAssetConnectionPointType.STRING);
    public readonly json = this._registerInput("json", NodeAssetConnectionPointType.JSON);

    public override async _buildBlockAsync(): Promise<void> {}
}

const Cases: ReadonlyArray<{
    readonly title: string;
    readonly make: (asset: NodeAsset) => LiteralBlock;
    readonly expectedType: NodeAssetConnectionPointType;
    readonly expectedValue: unknown;
}> = [
    {
        title: "NumberLiteral",
        make: (asset) => {
            const block = new NumberLiteral("n", asset);
            block.value = 42;
            return block;
        },
        expectedType: NodeAssetConnectionPointType.NUMBER,
        expectedValue: 42,
    },
    {
        title: "StringLiteral",
        make: (asset) => {
            const block = new StringLiteral("s", asset);
            block.value = "/nodes/0/translation";
            return block;
        },
        expectedType: NodeAssetConnectionPointType.STRING,
        expectedValue: "/nodes/0/translation",
    },
    {
        title: "JsonLiteral",
        make: (asset) => {
            const block = new JsonLiteral("j", asset);
            block.value = { hello: [1, 2, 3] };
            return block;
        },
        expectedType: NodeAssetConnectionPointType.JSON,
        expectedValue: { hello: [1, 2, 3] },
    },
];

describe("value literals", () => {
    it.each(Cases)("$title emits its stored value with the right kind", async ({ make, expectedType, expectedValue }) => {
        const asset = new NodeAsset("literal-output");
        const block = make(asset);

        await block._buildBlockAsync();

        expect(block.output.type).toBe(expectedType);
        expect(block.output.value).toEqual(expectedValue);
    });

    it.each(Cases)("$title round-trips value through save/load", ({ make, expectedValue }) => {
        const asset = new NodeAsset("literal-roundtrip");
        const original = make(asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // Parse rebuilds via the registry, so a successful reconstruction also proves the literal
        // self-registered its factory at import time.
        expect(parsed.attachedBlocks).toHaveLength(1);
        const restored = parsed.attachedBlocks[0];
        expect(restored.getClassName()).toBe(original.getClassName());
        expect((restored as LiteralBlock).value).toEqual(expectedValue);
    });

    it("connects same-kind ports and rejects mismatched kinds (kind-equality only)", () => {
        const asset = new NodeAsset("literal-wiring");
        const number = new NumberLiteral("n", asset);
        const string = new StringLiteral("s", asset);
        const json = new JsonLiteral("j", asset);
        const consumer = new ScalarConsumer("c", asset);

        number.output.connectTo(consumer.number);
        string.output.connectTo(consumer.string);
        json.output.connectTo(consumer.json);

        expect(consumer.number.connectedPoint).toBe(number.output);
        expect(consumer.string.connectedPoint).toBe(string.output);
        expect(consumer.json.connectedPoint).toBe(json.output);

        // A STRING output cannot feed a SCENE input: connectTo checks kind-equality (ADR 0002).
        expect(() => string.output.connectTo(consumer.scene)).toThrow(/incompatible connection point types/);
    });
});
