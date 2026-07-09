import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { ResolvePointerToAccessor } from "../../src/selector/pointerToAccessor";

/**
 * Builds a small in-code `Document` exercising every supported pointer family: a node with a transform,
 * a PBR material with factors and an assignable texture, a mesh with morph weights, and a perspective
 * camera.
 * @returns The document and its properties for direct assertions.
 */
function CreateFixture() {
    const document = new Document();

    const node = document.createNode("node0").setTranslation([1, 2, 3]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]).setWeights([0.25, 0.75]);

    const material = document.createMaterial("mat0").setEmissiveFactor([0, 0, 0]).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(1).setRoughnessFactor(1);

    const mesh = document.createMesh("mesh0").setWeights([0.1, 0.2]);

    const camera = document.createCamera("cam0").setType("perspective").setYFov(0.8).setZNear(0.1).setZFar(100);

    const texture = document.createTexture("tex0");

    return { document, node, material, mesh, camera, texture };
}

describe("ResolvePointerToAccessor", () => {
    describe("node TRS round-trip", () => {
        it("reads and writes translation (vec3)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/translation");

            expect(accessor.type).toBe("vec3");
            expect(accessor.get()).toEqual([1, 2, 3]);

            accessor.set([4, 5, 6]);
            expect(accessor.get()).toEqual([4, 5, 6]);
            // A fresh resolution observes the mutation, proving it landed on the document, not a copy.
            expect(ResolvePointerToAccessor(document, "/nodes/0/translation").get()).toEqual([4, 5, 6]);
        });

        it("reads and writes rotation (vec4)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/rotation");

            expect(accessor.type).toBe("vec4");
            expect(accessor.get()).toEqual([0, 0, 0, 1]);

            accessor.set([0, 1, 0, 0]);
            expect(accessor.get()).toEqual([0, 1, 0, 0]);
        });

        it("reads and writes scale (vec3)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/scale");

            expect(accessor.get()).toEqual([1, 1, 1]);
            accessor.set([2, 3, 4]);
            expect(accessor.get()).toEqual([2, 3, 4]);
        });

        it("reads and writes the local matrix (mat4)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/matrix");

            expect(accessor.type).toBe("mat4");
            // The fixture node is at (1,2,3) with identity rotation/scale.
            expect(accessor.get()).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]);

            const translated = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
            accessor.set(translated);
            expect(accessor.get()).toEqual(translated);
        });

        it("reads and writes morph target weights (number[])", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/weights");

            expect(accessor.type).toBe("number[]");
            expect(accessor.get()).toEqual([0.25, 0.75]);
            accessor.set([1, 0]);
            expect(accessor.get()).toEqual([1, 0]);
        });
    });

    describe("material factor round-trip", () => {
        it("reads and writes emissiveFactor (vec3)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/materials/0/emissiveFactor");

            expect(accessor.type).toBe("vec3");
            expect(accessor.get()).toEqual([0, 0, 0]);
            accessor.set([1, 0, 0]);
            expect(accessor.get()).toEqual([1, 0, 0]);
        });

        it("maps the nested pbrMetallicRoughness/baseColorFactor pointer to the flat setter (vec4)", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorFactor");

            expect(accessor.type).toBe("vec4");
            expect(accessor.get()).toEqual([1, 1, 1, 1]);
            accessor.set([1, 0, 0, 1]);
            expect(accessor.get()).toEqual([1, 0, 0, 1]);
        });

        it("reads and writes metallicFactor and roughnessFactor (number)", () => {
            const { document } = CreateFixture();
            const metallic = ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/metallicFactor");
            const roughness = ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/roughnessFactor");

            expect(metallic.type).toBe("number");
            expect(metallic.get()).toBe(1);
            metallic.set(0.25);
            expect(metallic.get()).toBe(0.25);

            roughness.set(0.5);
            expect(roughness.get()).toBe(0.5);
        });
    });

    describe("texture slot round-trip", () => {
        it("resolves a texture slot to the texture property and assigns it", () => {
            const { document, material, texture } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture");

            expect(accessor.type).toBe("texture");
            expect(accessor.get()).toBeNull();
            // getTarget is the owning material; the value is the texture slot.
            expect(accessor.getTarget()).toBe(material);

            accessor.set(texture);
            expect(accessor.get()).toBe(texture);
            expect(material.getBaseColorTexture()).toBe(texture);

            accessor.set(null);
            expect(accessor.get()).toBeNull();
        });

        it("resolves the standalone normalTexture and emissiveTexture slots", () => {
            const { document, texture } = CreateFixture();
            const normal = ResolvePointerToAccessor(document, "/materials/0/normalTexture");
            const emissive = ResolvePointerToAccessor(document, "/materials/0/emissiveTexture");

            normal.set(texture);
            emissive.set(texture);
            expect(normal.get()).toBe(texture);
            expect(emissive.get()).toBe(texture);
        });
    });

    describe("extras passthrough", () => {
        it("reads and writes the whole extras bag (json)", () => {
            const { document, node } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/nodes/0/extras");

            expect(accessor.type).toBe("json");
            expect(accessor.get()).toEqual({});

            accessor.set({ author: "nae", tags: [1, 2, 3] });
            expect(accessor.get()).toEqual({ author: "nae", tags: [1, 2, 3] });
            expect(node.getExtras()).toEqual({ author: "nae", tags: [1, 2, 3] });
        });

        it("reads and writes a single extras key without clobbering siblings", () => {
            const { document, material } = CreateFixture();
            material.setExtras({ existing: "keep" });

            const accessor = ResolvePointerToAccessor(document, "/materials/0/extras/customId");
            expect(accessor.get()).toBeUndefined();

            accessor.set(42);
            expect(accessor.get()).toBe(42);
            expect(material.getExtras()).toEqual({ existing: "keep", customId: 42 });
        });
    });

    describe("mesh and camera basics", () => {
        it("reads and writes mesh morph weights", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/meshes/0/weights");

            expect(accessor.get()).toEqual([0.1, 0.2]);
            accessor.set([0.5]);
            expect(accessor.get()).toEqual([0.5]);
        });

        it("reads and writes perspective camera parameters", () => {
            const { document } = CreateFixture();
            const yfov = ResolvePointerToAccessor(document, "/cameras/0/perspective/yfov");
            const znear = ResolvePointerToAccessor(document, "/cameras/0/perspective/znear");

            expect(yfov.type).toBe("number");
            expect(yfov.get()).toBeCloseTo(0.8);
            yfov.set(1.2);
            expect(yfov.get()).toBeCloseTo(1.2);

            znear.set(0.5);
            expect(znear.get()).toBeCloseTo(0.5);
        });

        it("reads and writes the generic name on any collection", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToAccessor(document, "/meshes/0/name");

            expect(accessor.type).toBe("string");
            expect(accessor.get()).toBe("mesh0");
            accessor.set("renamed");
            expect(accessor.get()).toBe("renamed");
        });
    });

    describe("getTarget", () => {
        it("returns the owning property for a value pointer", () => {
            const { document, node } = CreateFixture();
            expect(ResolvePointerToAccessor(document, "/nodes/0/translation").getTarget()).toBe(node);
        });
    });

    describe("type reporting", () => {
        it("reports the value kind for each resolved family", () => {
            const { document } = CreateFixture();
            expect(ResolvePointerToAccessor(document, "/nodes/0/translation").type).toBe("vec3");
            expect(ResolvePointerToAccessor(document, "/nodes/0/rotation").type).toBe("vec4");
            expect(ResolvePointerToAccessor(document, "/nodes/0/matrix").type).toBe("mat4");
            expect(ResolvePointerToAccessor(document, "/nodes/0/weights").type).toBe("number[]");
            expect(ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/metallicFactor").type).toBe("number");
            expect(ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture").type).toBe("texture");
            expect(ResolvePointerToAccessor(document, "/nodes/0/name").type).toBe("string");
            expect(ResolvePointerToAccessor(document, "/nodes/0/extras").type).toBe("json");
        });
    });

    describe("bad pointers throw clear, pointer-naming errors", () => {
        it("throws on an out-of-range index", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/nodes/99/translation")).toThrow("/nodes/99/translation");
            expect(() => ResolvePointerToAccessor(document, "/nodes/99/translation")).toThrow(/out of range/);
        });

        it("throws on an unknown property", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/materials/0/bogus")).toThrow(/unknown property "bogus"/);
        });

        it("throws on an unknown collection", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/widgets/0/size")).toThrow(/unknown collection "widgets"/);
        });

        it("throws when the pointer does not start with a slash", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "nodes/0/translation")).toThrow(/must start with "\/"/);
        });

        it("throws on a non-integer index", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/nodes/x/translation")).toThrow(/invalid index "x"/);
        });

        it("throws when the pointer is missing a property segment", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/nodes/0")).toThrow(/incomplete/);
        });

        it("throws on a nested extras key path (single-target rule)", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/nodes/0/extras/a/b")).toThrow(/nested extras/);
        });

        it("throws on a leading-zero index instead of silently resolving to another target", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/nodes/01/translation")).toThrow(/invalid index "01"/);
        });

        it("throws on a trailing slash after extras (empty key) instead of writing an empty key", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToAccessor(document, "/materials/0/extras/")).toThrow(/empty extras key/);
        });
    });
});
