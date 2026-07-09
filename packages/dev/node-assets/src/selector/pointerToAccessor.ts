import { type Camera, type Document, type Material, type Mesh, type Node, type Property, type Root, type Texture } from "@gltf-transform/core";

import { type ImagePayload } from "../Blocks/imagePayload";

/**
 * The value kind a resolved property carries. Mirrors the concept of the glTF loader's
 * `IObjectAccessor.type`, but the vocabulary is gltf-transform's (flat arrays for vectors/matrices,
 * a `texture` handle for texture slots, an `image` payload for a texture slot's decoded-free image
 * bytes, and `json` for the free-form `extras` bag).
 */
export type PropertyAccessorType = "number" | "number[]" | "vec3" | "vec4" | "mat4" | "string" | "texture" | "image" | "json";

/**
 * A get/set handle over a single property of a gltf-transform `Document`, resolved from a glTF Object
 * Model JSON Pointer. It is the gltf-transform analog of the glTF loader's `IObjectAccessor`
 * (`get` / `set` / `type` / `getTarget`), but it reads and writes gltf-transform properties rather than
 * live Babylon scene objects.
 */
export interface IPropertyAccessor {
    /** The value kind the resolved property carries. */
    readonly type: PropertyAccessorType;
    /**
     * Reads the current value at the resolved property.
     * @returns The current value (e.g. a `vec3` array, a number, a `Texture`, or an `extras` value).
     */
    get(): unknown;
    /**
     * Writes a new value to the resolved property.
     * @param value - The value to write; its shape must match this accessor's `type`.
     */
    set(value: unknown): void;
    /**
     * Returns the gltf-transform property that owns the resolved value (e.g. the `Node`, `Material`,
     * `Mesh`, or `Camera` addressed by the pointer's collection and index).
     * @returns The owning property.
     */
    getTarget(): Property;
}

/**
 * One entry in the mapping table: how to read and write a property off an already-resolved target.
 * The target is typed `any` because a single table holds bindings for several gltf-transform classes;
 * the resolver guarantees the concrete type before calling these.
 */
interface IPropertyBinding {
    /** The value kind this property carries. */
    type: PropertyAccessorType;
    /** Reads the property off the resolved target. */
    get: (target: any) => unknown;
    /** Writes the property onto the resolved target. */
    set: (target: any, value: unknown) => void;
}

/**
 * A collection in the glTF Object Model (`nodes`, `materials`, ...): how to list its members off the
 * `Root`, and the property paths addressable on each member.
 */
interface ICollectionMapping {
    /** Lists the collection's members in index order. */
    list: (root: Root) => Property[];
    /** Maps a glTF property path (segments joined with `/`) to its binding. */
    properties: Map<string, IPropertyBinding>;
}

/** Node transform and morph weights — the `/nodes/{i}/...` surface. */
const NodeProperties = new Map<string, IPropertyBinding>([
    ["translation", { type: "vec3", get: (node: Node) => node.getTranslation(), set: (node: Node, value) => node.setTranslation(value as [number, number, number]) }],
    ["rotation", { type: "vec4", get: (node: Node) => node.getRotation(), set: (node: Node, value) => node.setRotation(value as [number, number, number, number]) }],
    ["scale", { type: "vec3", get: (node: Node) => node.getScale(), set: (node: Node, value) => node.setScale(value as [number, number, number]) }],
    ["matrix", { type: "mat4", get: (node: Node) => node.getMatrix(), set: (node: Node, value) => node.setMatrix(value as Parameters<Node["setMatrix"]>[0]) }],
    ["weights", { type: "number[]", get: (node: Node) => node.getWeights(), set: (node: Node, value) => node.setWeights(value as number[]) }],
]);

/**
 * PBR material factors and texture slots — the `/materials/{i}/...` surface. glTF nests the metallic
 * roughness factors under `pbrMetallicRoughness`; gltf-transform flattens them onto `Material`, so the
 * nested pointer path maps to the flat getter/setter.
 */
const MaterialProperties = new Map<string, IPropertyBinding>([
    [
        "emissiveFactor",
        {
            type: "vec3",
            get: (material: Material) => material.getEmissiveFactor(),
            set: (material: Material, value) => material.setEmissiveFactor(value as [number, number, number]),
        },
    ],
    [
        "pbrMetallicRoughness/baseColorFactor",
        {
            type: "vec4",
            get: (material: Material) => material.getBaseColorFactor(),
            set: (material: Material, value) => material.setBaseColorFactor(value as [number, number, number, number]),
        },
    ],
    [
        "pbrMetallicRoughness/metallicFactor",
        { type: "number", get: (material: Material) => material.getMetallicFactor(), set: (material: Material, value) => material.setMetallicFactor(value as number) },
    ],
    [
        "pbrMetallicRoughness/roughnessFactor",
        { type: "number", get: (material: Material) => material.getRoughnessFactor(), set: (material: Material, value) => material.setRoughnessFactor(value as number) },
    ],
    [
        "pbrMetallicRoughness/baseColorTexture",
        { type: "texture", get: (material: Material) => material.getBaseColorTexture(), set: (material: Material, value) => material.setBaseColorTexture(value as Texture | null) },
    ],
    [
        "pbrMetallicRoughness/metallicRoughnessTexture",
        {
            type: "texture",
            get: (material: Material) => material.getMetallicRoughnessTexture(),
            set: (material: Material, value) => material.setMetallicRoughnessTexture(value as Texture | null),
        },
    ],
    [
        "normalTexture",
        { type: "texture", get: (material: Material) => material.getNormalTexture(), set: (material: Material, value) => material.setNormalTexture(value as Texture | null) },
    ],
    [
        "occlusionTexture",
        { type: "texture", get: (material: Material) => material.getOcclusionTexture(), set: (material: Material, value) => material.setOcclusionTexture(value as Texture | null) },
    ],
    [
        "emissiveTexture",
        { type: "texture", get: (material: Material) => material.getEmissiveTexture(), set: (material: Material, value) => material.setEmissiveTexture(value as Texture | null) },
    ],
]);

/** Morph weights — the `/meshes/{i}/...` surface. Proves the table generalises past nodes/materials. */
const MeshProperties = new Map<string, IPropertyBinding>([
    ["weights", { type: "number[]", get: (mesh: Mesh) => mesh.getWeights(), set: (mesh: Mesh, value) => mesh.setWeights(value as number[]) }],
]);

/**
 * Perspective and orthographic projection parameters — the `/cameras/{i}/...` surface. gltf-transform
 * stores near/far on `Camera` directly, so both projection sub-paths share the same near/far setters.
 */
const CameraProperties = new Map<string, IPropertyBinding>([
    ["perspective/yfov", { type: "number", get: (camera: Camera) => camera.getYFov(), set: (camera: Camera, value) => camera.setYFov(value as number) }],
    [
        "perspective/aspectRatio",
        { type: "number", get: (camera: Camera) => camera.getAspectRatio(), set: (camera: Camera, value) => camera.setAspectRatio(value as number | null) },
    ],
    ["perspective/znear", { type: "number", get: (camera: Camera) => camera.getZNear(), set: (camera: Camera, value) => camera.setZNear(value as number) }],
    ["perspective/zfar", { type: "number", get: (camera: Camera) => camera.getZFar(), set: (camera: Camera, value) => camera.setZFar(value as number) }],
    ["orthographic/xmag", { type: "number", get: (camera: Camera) => camera.getXMag(), set: (camera: Camera, value) => camera.setXMag(value as number) }],
    ["orthographic/ymag", { type: "number", get: (camera: Camera) => camera.getYMag(), set: (camera: Camera, value) => camera.setYMag(value as number) }],
    ["orthographic/znear", { type: "number", get: (camera: Camera) => camera.getZNear(), set: (camera: Camera, value) => camera.setZNear(value as number) }],
    ["orthographic/zfar", { type: "number", get: (camera: Camera) => camera.getZFar(), set: (camera: Camera, value) => camera.setZFar(value as number) }],
]);

/** Properties available on every property: the glTF `name` string. */
const CommonProperties = new Map<string, IPropertyBinding>([
    ["name", { type: "string", get: (property: Property) => property.getName(), set: (property: Property, value) => property.setName(value as string) }],
]);

/** The addressable collections, keyed by their glTF Object Model root name. */
const Collections = new Map<string, ICollectionMapping>([
    ["nodes", { list: (root) => root.listNodes(), properties: NodeProperties }],
    ["materials", { list: (root) => root.listMaterials(), properties: MaterialProperties }],
    ["meshes", { list: (root) => root.listMeshes(), properties: MeshProperties }],
    ["cameras", { list: (root) => root.listCameras(), properties: CameraProperties }],
]);

/** The first property segment that routes to the free-form `extras` bag. */
const ExtrasSegment = "extras";

/**
 * Resolves a glTF Object Model JSON Pointer against a gltf-transform `Document` and returns a
 * {@link IPropertyAccessor} bound to the addressed property.
 *
 * The pointer grammar is borrowed from the Khronos glTF Object Model (as used by `KHR_animation_pointer`,
 * `KHR_interactivity`, and FlowGraph): `/<collection>/<index>/<propertyPath>`, e.g. `/nodes/0/translation`
 * or `/materials/2/pbrMetallicRoughness/baseColorFactor`. Resolution is single-target and index-based;
 * wildcards (a `*` in place of an index) and by-name queries are not supported. The supported surface
 * covers node transforms, PBR material factors and texture slots, mesh/camera basics, the `name` string,
 * and an `extras` passthrough (`/nodes/0/extras` for the whole bag or `/nodes/0/extras/<key>` for one key).
 *
 * The converter borrows only the loader's pointer grammar and accessor concept; it resolves against
 * gltf-transform properties, never the glTF loader or Babylon scene objects.
 * @param document - The gltf-transform `Document` (the SCENE spine) to resolve against.
 * @param pointer - The glTF Object Model JSON Pointer string.
 * @returns An accessor bound to the resolved property.
 * @throws If the pointer is malformed, names an unknown collection or property, or its index is not a
 * non-negative integer in range.
 */
export function ResolvePointerToAccessor(document: Document, pointer: string): IPropertyAccessor {
    const { collection, collectionName, target, propertyPath } = ResolvePointerTarget(document, pointer);

    if (propertyPath[0] === ExtrasSegment) {
        return CreateExtrasAccessor(pointer, target, propertyPath);
    }

    const propertyKey = propertyPath.join("/");
    const binding = collection.properties.get(propertyKey) ?? CommonProperties.get(propertyKey);
    if (!binding) {
        throw new Error(`Pointer "${pointer}" references unknown property "${propertyKey}" on collection "${collectionName}".`);
    }

    return {
        type: binding.type,
        get: () => binding.get(target),
        set: (value) => binding.set(target, value),
        getTarget: () => target,
    };
}

/**
 * Resolves a material **texture-slot** pointer against a gltf-transform `Document` and returns an
 * {@link IPropertyAccessor} that speaks in IMAGE payloads: its `get` returns the slot texture's encoded
 * image bytes and mime type as an {@link ImagePayload}, and its `set` replaces them, creating the
 * `Texture` and wiring it into the slot when the slot is empty.
 *
 * This is the IMAGE-typed member of the selector family, parallel to the JSON-typed
 * {@link ResolvePointerToAccessor} (which resolves the same slot to its `Texture` reference). It reuses
 * the one converter mapping table: a pointer only resolves here when it names a `texture`-typed slot
 * (baseColor, metallicRoughness, normal, occlusion, emissive); any other property throws. The image
 * bytes stay encoded end to end (no pixel decode / canvas); only gltf-transform `Texture` image APIs
 * are used.
 * @param document - The gltf-transform `Document` (the SCENE spine) to resolve against.
 * @param pointer - The glTF Object Model JSON Pointer string naming a material texture slot.
 * @returns An IMAGE-typed accessor over the slot texture's image payload.
 * @throws If the pointer is malformed or out of range (the same errors as {@link ResolvePointerToAccessor}),
 * or does not name a texture slot.
 */
export function ResolvePointerToImageAccessor(document: Document, pointer: string): IPropertyAccessor {
    const { collection, collectionName, target, propertyPath } = ResolvePointerTarget(document, pointer);

    const propertyKey = propertyPath.join("/");
    const binding = collection.properties.get(propertyKey);
    if (!binding || binding.type !== "texture") {
        throw new Error(`Pointer "${pointer}" does not name a texture slot on collection "${collectionName}"; the image accessor only resolves texture slots.`);
    }

    return CreateTextureImageAccessor(document, pointer, target, binding);
}

/**
 * Parses and resolves the `/${collection}/${index}` prefix shared by every pointer, returning the
 * addressed target property along with its collection mapping and the remaining property path. This is
 * the common front half of the converter that both the value accessor ({@link ResolvePointerToAccessor})
 * and the texture-image accessor ({@link ResolvePointerToImageAccessor}) build on, so both speak the
 * same pointer grammar and throw the same malformed/out-of-range errors.
 * @param document - The gltf-transform `Document` to resolve against.
 * @param pointer - The glTF Object Model JSON Pointer string.
 * @returns The resolved collection, its name, the addressed target, and the trailing property path.
 * @throws If the pointer is malformed, incomplete, names an unknown collection, or its index is not a
 * non-negative integer in range.
 */
function ResolvePointerTarget(document: Document, pointer: string): { collection: ICollectionMapping; collectionName: string; target: Property; propertyPath: string[] } {
    if (!pointer.startsWith("/")) {
        throw new Error(`Pointer "${pointer}" is malformed: it must start with "/".`);
    }

    const segments = pointer.slice(1).split("/");
    if (segments.length < 3) {
        throw new Error(`Pointer "${pointer}" is incomplete: expected "/<collection>/<index>/<property>".`);
    }

    const [collectionName, indexSegment, ...propertyPath] = segments;

    const collection = Collections.get(collectionName);
    if (!collection) {
        throw new Error(`Pointer "${pointer}" references unknown collection "${collectionName}".`);
    }

    if (!/^(0|[1-9]\d*)$/.test(indexSegment)) {
        throw new Error(`Pointer "${pointer}" has an invalid index "${indexSegment}": expected a non-negative integer without leading zeros.`);
    }
    const index = Number(indexSegment);

    const members = collection.list(document.getRoot());
    const target = members[index];
    if (!target) {
        throw new Error(`Pointer "${pointer}" index ${index} is out of range for collection "${collectionName}" (length ${members.length}).`);
    }

    return { collection, collectionName, target, propertyPath };
}

/**
 * Builds an IMAGE-typed accessor over a material texture slot. Reads surface the slot `Texture`'s
 * encoded image as an {@link ImagePayload}; writes replace that image (bytes + mime type), creating the
 * `Texture` and wiring it into the slot via the same slot binding when none exists yet — leaving the
 * rest of the material untouched.
 * @param document - The document, used to create a `Texture` when replacing into an empty slot.
 * @param pointer - The original pointer, for error messages.
 * @param target - The resolved `Material` that owns the texture slot.
 * @param binding - The slot's texture binding from the converter mapping table; its `get`/`set` read
 * and assign the slot `Texture`.
 * @returns An accessor whose `get`/`set` read and replace the slot texture's image payload.
 */
function CreateTextureImageAccessor(document: Document, pointer: string, target: Property, binding: IPropertyBinding): IPropertyAccessor {
    return {
        type: "image",
        get: () => {
            const texture = binding.get(target) as Texture | null;
            const data = texture?.getImage();
            if (!texture || !data) {
                throw new Error(`Pointer "${pointer}" has no texture image to read: the slot is empty or its texture has no image.`);
            }
            return { data, mimeType: texture.getMimeType() } satisfies ImagePayload;
        },
        set: (value) => {
            const payload = value as ImagePayload;
            let texture = binding.get(target) as Texture | null;
            if (!texture) {
                texture = document.createTexture();
                binding.set(target, texture);
            }
            texture.setImage(payload.data);
            texture.setMimeType(payload.mimeType);
        },
        getTarget: () => target,
    };
}

/**
 * Builds an accessor over a target's `extras` bag: `/.../extras` addresses the whole object and
 * `/.../extras/<key>` addresses a single top-level key. Nested key paths are deferred (single-target rule).
 * @param pointer - The original pointer, for error messages.
 * @param target - The resolved property that owns the `extras`.
 * @param propertyPath - The property segments, beginning with `extras`.
 * @returns An accessor over the whole `extras` object or a single key.
 */
function CreateExtrasAccessor(pointer: string, target: Property, propertyPath: string[]): IPropertyAccessor {
    const keys = propertyPath.slice(1);

    if (keys.length === 0) {
        return {
            type: "json",
            get: () => target.getExtras(),
            set: (value) => target.setExtras(value as Record<string, unknown>),
            getTarget: () => target,
        };
    }

    if (keys.length > 1) {
        throw new Error(`Pointer "${pointer}" addresses a nested extras path; only "/.../extras" or "/.../extras/<key>" is supported.`);
    }

    const key = keys[0];
    if (key === "") {
        throw new Error(`Pointer "${pointer}" has an empty extras key: expected "/.../extras/<key>".`);
    }
    return {
        type: "json",
        get: () => target.getExtras()[key],
        set: (value) => {
            const extras = { ...target.getExtras() };
            extras[key] = value;
            target.setExtras(extras);
        },
        getTarget: () => target,
    };
}
