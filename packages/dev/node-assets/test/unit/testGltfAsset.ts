import { type Document } from "@gltf-transform/core";

import { GetGltfAsset, GltfAsset } from "../../src/representations/gltfAsset";

export function CreateTestGltfAsset(document: Document, identity = "test-gltf"): GltfAsset {
    return new GltfAsset(document, {
        identity,
        revision: 0,
        manifest: { format: "gltf" },
    });
}

export function GetTestGltfDocument(value: unknown): Document {
    return GetGltfAsset(value, "test").document;
}
