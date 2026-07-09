import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ResolvePointerToAccessor, ResolvePointerToImageAccessor } from "../../src/selector/pointerToAccessor";

// Distinctive fake image bytes (a PNG signature plus payload). The converter is canvas-free, so it
// never decodes these; it only carries the bytes and mime type, so any buffer works.
const BaseColorPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const EmissiveJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);
const ReplacementWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 42, 42, 42]);

/**
 * Builds a small in-code `Document` with a PBR material whose baseColor slot holds a known image, an
 * emissive slot holds a second distinct image, and whose metallicRoughness slot is left empty. The
 * factors are set to non-default values so a replace can prove they are left untouched.
 * @returns The document and its properties for direct assertions.
 */
function CreateFixture() {
    const document = new Document();

    const material = document.createMaterial("mat0").setBaseColorFactor([0.2, 0.4, 0.6, 1]).setMetallicFactor(0.25).setRoughnessFactor(0.75).setEmissiveFactor([0.1, 0.2, 0.3]);

    const baseColorTexture = document.createTexture("baseColor").setImage(BaseColorPng).setMimeType("image/png");
    material.setBaseColorTexture(baseColorTexture);

    const emissiveTexture = document.createTexture("emissive").setImage(EmissiveJpeg).setMimeType("image/jpeg");
    material.setEmissiveTexture(emissiveTexture);

    return { document, material, baseColorTexture, emissiveTexture };
}

describe("ResolvePointerToImageAccessor", () => {
    describe("read", () => {
        it("reports the IMAGE value kind for a texture slot", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture");

            expect(accessor.type).toBe("image");
        });

        it("returns the slot texture's exact bytes and mime type as an IMAGE payload", () => {
            const { document, material } = CreateFixture();
            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture");

            const payload = accessor.get() as ImagePayload;
            expect(payload.data).toEqual(BaseColorPng);
            expect(payload.mimeType).toBe("image/png");

            // getTarget is the owning material, mirroring the JSON-typed texture accessor.
            expect(accessor.getTarget()).toBe(material);
        });

        it("resolves standalone (non-pbrMetallicRoughness) texture slots such as emissiveTexture", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/emissiveTexture");

            const payload = accessor.get() as ImagePayload;
            expect(payload.data).toEqual(EmissiveJpeg);
            expect(payload.mimeType).toBe("image/jpeg");
        });
    });

    describe("replace", () => {
        it("replaces a slot texture's image and mime type, leaving factors and other slots untouched", () => {
            const { document, material, baseColorTexture, emissiveTexture } = CreateFixture();
            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture");

            accessor.set({ data: ReplacementWebp, mimeType: "image/webp" } satisfies ImagePayload);

            // A fresh resolution observes the mutation, proving it landed on the document, not a copy.
            const reread = ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture").get() as ImagePayload;
            expect(reread.data).toEqual(ReplacementWebp);
            expect(reread.mimeType).toBe("image/webp");

            // The same Texture instance is reused (its image swapped), not a fresh one wired into the slot.
            expect(material.getBaseColorTexture()).toBe(baseColorTexture);

            // Factors and the untouched emissive slot are unchanged.
            expect(material.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);
            expect(material.getMetallicFactor()).toBe(0.25);
            expect(material.getRoughnessFactor()).toBe(0.75);
            expect(material.getEmissiveFactor()).toEqual([0.1, 0.2, 0.3]);
            expect(material.getEmissiveTexture()).toBe(emissiveTexture);
            expect(emissiveTexture.getImage()).toEqual(EmissiveJpeg);
        });
    });

    describe("create-on-empty", () => {
        it("creates a Texture, wires it into the empty slot, and reads back the written payload", () => {
            const { document, material } = CreateFixture();
            expect(material.getMetallicRoughnessTexture()).toBeNull();

            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/metallicRoughnessTexture");
            accessor.set({ data: ReplacementWebp, mimeType: "image/webp" } satisfies ImagePayload);

            const created = material.getMetallicRoughnessTexture();
            expect(created).not.toBeNull();
            expect(created!.getImage()).toEqual(ReplacementWebp);
            expect(created!.getMimeType()).toBe("image/webp");

            const reread = accessor.get() as ImagePayload;
            expect(reread.data).toEqual(ReplacementWebp);
            expect(reread.mimeType).toBe("image/webp");
        });
    });

    describe("errors", () => {
        it("throws a clear, pointer-naming error when reading an empty slot", () => {
            const { document } = CreateFixture();
            const accessor = ResolvePointerToImageAccessor(document, "/materials/0/normalTexture");

            expect(() => accessor.get()).toThrow("/materials/0/normalTexture");
            expect(() => accessor.get()).toThrow(/no texture/i);
        });

        it("throws when the referenced slot names a property that is not a texture slot", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToImageAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorFactor")).toThrow(/texture slot/i);
        });

        it("throws the converter's clear pointer-naming error on an out-of-range material index", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToImageAccessor(document, "/materials/9/pbrMetallicRoughness/baseColorTexture")).toThrow(
                "/materials/9/pbrMetallicRoughness/baseColorTexture"
            );
            expect(() => ResolvePointerToImageAccessor(document, "/materials/9/pbrMetallicRoughness/baseColorTexture")).toThrow(/out of range/);
        });

        it("throws the converter's clear pointer-naming error on an unknown collection", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToImageAccessor(document, "/widgets/0/baseColorTexture")).toThrow(/unknown collection "widgets"/);
        });

        it("throws the converter's clear pointer-naming error on a malformed pointer", () => {
            const { document } = CreateFixture();
            expect(() => ResolvePointerToImageAccessor(document, "materials/0/emissiveTexture")).toThrow(/must start with "\/"/);
        });
    });

    describe("JSON-typed accessor is unaffected (add, do not replace)", () => {
        it("still resolves the same slot to its texture property via ResolvePointerToAccessor", () => {
            const { document, material, baseColorTexture } = CreateFixture();
            const jsonAccessor = ResolvePointerToAccessor(document, "/materials/0/pbrMetallicRoughness/baseColorTexture");

            // The JSON-typed accessor keeps its "texture" kind and returns the Texture reference itself.
            expect(jsonAccessor.type).toBe("texture");
            expect(jsonAccessor.get()).toBe(baseColorTexture);
            expect(jsonAccessor.getTarget()).toBe(material);

            // Assigning a different texture through it still works and does not touch image bytes.
            const swapped = document.createTexture("swapped");
            jsonAccessor.set(swapped);
            expect(material.getBaseColorTexture()).toBe(swapped);
        });
    });
});
