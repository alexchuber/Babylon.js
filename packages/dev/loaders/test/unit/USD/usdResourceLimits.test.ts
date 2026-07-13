import { describe, expect, it } from "vitest";
import { ParseUsda } from "loaders/USD/resolution/parser/usda/usdaParser";
import { ComposeLayerStack } from "loaders/USD/resolution/composition/composeLayerStack";
import { type ISdfLayer, type ISdfPrimSpec, type ISdfReference } from "loaders/USD/resolution/sdf";

// Untrusted-input resource safety: adversarial USD must be rejected with a typed, bounded
// parser/composition error (never a native RangeError, hang, or silent truncation), while
// ordinary deep-but-shallow and wide stages keep parsing without penalty.

function nestedArrayValue(depth: number): string {
    return "[".repeat(depth) + "0" + "]".repeat(depth);
}

function nestedVariantSets(depth: number): string {
    let inner = "";
    for (let level = depth - 1; level >= 0; level--) {
        inner = `variantSet "v${level}" {\n"a" {\n${inner}}\n}\n`;
    }
    return `#usda 1.0\ndef Xform "Root" {\n${inner}}\n`;
}

function createLayer(identifier: string, rootPrims: ISdfPrimSpec[]): ISdfLayer {
    return { identifier, subLayers: [], rootPrims };
}

function createPrim(path: string, overrides: Partial<ISdfPrimSpec> = {}): ISdfPrimSpec {
    return {
        name: path.slice(path.lastIndexOf("/") + 1),
        path,
        specifier: "def",
        typeName: "Xform",
        properties: {},
        children: [],
        ...overrides,
    };
}

function explicitReferences(references: ISdfReference[]): ISdfPrimSpec["references"] {
    return { isExplicit: true, explicit: references };
}

describe("USD parser resource limits", () => {
    it("rejects excessively nested USDA values with a bounded parser error", () => {
        const source = `#usda 1.0\ndef Xform "P" {\n    int[] deep = ${nestedArrayValue(300)}\n}\n`;
        expect(() => ParseUsda(source, "memory:deep-value.usda")).toThrow("value nesting depth exceeds");
    });

    it("rejects pathologically deep values without a native RangeError", () => {
        const source = `#usda 1.0\ndef Xform "P" {\n    int[] deep = ${nestedArrayValue(50000)}\n}\n`;
        expect(() => ParseUsda(source, "memory:very-deep-value.usda")).toThrow("value nesting depth exceeds");
        expect(() => ParseUsda(source, "memory:very-deep-value.usda")).not.toThrow(RangeError);
    });

    it("still parses ordinary nested values below the cap", () => {
        const source = `#usda 1.0\ndef Xform "P" {\n    int[] shallow = ${nestedArrayValue(8)}\n}\n`;
        expect(() => ParseUsda(source, "memory:shallow-value.usda")).not.toThrow();
    });

    it("counts nested variant sets against the shared nesting limit", () => {
        expect(() => ParseUsda(nestedVariantSets(300), "memory:deep-variants.usda")).toThrow("nesting depth exceeds");
    });

    it("does not penalize wide variant sets with many sibling variants", () => {
        const variants = Array.from({ length: 500 }, (_, index) => `"v${index}" {\n}`).join("\n");
        const source = `#usda 1.0\ndef Xform "Root" {\nvariantSet "shape" {\n${variants}\n}\n}\n`;
        expect(() => ParseUsda(source, "memory:wide-variants.usda")).not.toThrow();
    });
});

describe("USD composition resource limits", () => {
    it("composes exactly up to the node budget and rejects the prim that would exceed it", () => {
        const prims = Array.from({ length: 8 }, (_, index) => createPrim(`/P${index}`));
        const rootLayer = createLayer("root.usd", prims);

        expect(() => ComposeLayerStack(rootLayer, () => undefined, { maxCompositionNodes: 8 })).not.toThrow();
        expect(() => ComposeLayerStack(rootLayer, () => undefined, { maxCompositionNodes: 7 })).toThrow("composed prim count exceeds");
    });

    it("rejects reference amplification that exceeds the composition budget", () => {
        const assetPrims = Array.from({ length: 50 }, (_, index) => createPrim(`/Asset/Child${index}`));
        const assetLayer = createLayer("asset.usd", [createPrim("/Asset", { children: assetPrims })]);
        const rootLayer = createLayer("root.usd", [
            createPrim("/World", {
                references: explicitReferences([
                    { assetPath: "asset.usd", primPath: "/Asset" },
                    { assetPath: "asset.usd", primPath: "/Asset" },
                    { assetPath: "asset.usd", primPath: "/Asset" },
                ]),
            }),
        ]);

        expect(() => ComposeLayerStack(rootLayer, (assetPath) => (assetPath === "asset.usd" ? assetLayer : undefined), { maxCompositionNodes: 32 })).toThrow(
            "composed prim count exceeds"
        );
    });

    it("preserves ordinary wide stages under the default budget", () => {
        const prims = Array.from({ length: 2000 }, (_, index) => createPrim(`/P${index}`));
        const rootLayer = createLayer("root.usd", prims);
        expect(() => ComposeLayerStack(rootLayer, () => undefined)).not.toThrow();
    });
});
