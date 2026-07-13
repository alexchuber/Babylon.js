/**
 * Editor-owned Node Assets demo catalog.
 *
 * The entry payloads are JSON so the gallery, E2E fixtures, and future diagram
 * surfaces consume one data contract. Runtime-specific helpers and type guards
 * remain in {@link ./demoCatalogSchema}.
 */

import gltfOptimizeDracoBasisu from "./demoCatalog/gltf-optimize-draco-basisu.json";
import usdToGltf from "./demoCatalog/usd-to-gltf.json";
import usdToBabylonToGltf from "./demoCatalog/usd-to-babylon-to-gltf.json";
import babylonMutationToGltf from "./demoCatalog/babylon-mutation-to-gltf.json";
import nodeGeometryBoxToGltf from "./demoCatalog/node-geometry-box-to-gltf.json";
import textureExtractProcessReinsert from "./demoCatalog/texture-extract-process-reinsert.json";
import mixedGltfNodeGeometryComposition from "./demoCatalog/mixed-gltf-node-geometry-composition.json";
import multiDomainMaterialConstruction from "./demoCatalog/multi-domain-material-construction.json";

export * from "./demoCatalogSchema";

import { DemoCatalogSchemaVersion, type DemoCatalog, type DemoDefinition, type DemoSceneRepresentation, type DemoSelectionOwnerParity } from "./demoCatalogSchema";

/** JSON-safe catalog entry contract consumed by the editor and E2E catalog. */
export interface IDemoCatalogEntry extends DemoDefinition {}

/** JSON-safe top-level catalog contract. */
export interface IDemoCatalog {
    readonly version: typeof DemoCatalogSchemaVersion;
    readonly selectionParity: readonly DemoSelectionOwnerParity[];
    readonly demos: readonly IDemoCatalogEntry[];
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function RequireRecord(value: unknown, field: string, source: string): Record<string, unknown> {
    if (!IsRecord(value)) {
        throw new Error(`Demo catalog entry "${source}" must contain an object at "${field}".`);
    }
    return value;
}

function RequireArray(value: unknown, field: string, source: string): readonly unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`Demo catalog entry "${source}" must contain an array at "${field}".`);
    }
    return value;
}

/**
 * Validates the required JSON envelope and returns the typed catalog entry.
 *
 * Nested diagnostics retain their discriminated schema in TypeScript; this
 * boundary validates the required structural fields before the JSON is exposed
 * to runtime callers.
 *
 * @param value - Parsed JSON data.
 * @param source - Stable source label used in validation errors.
 * @returns The validated catalog entry.
 */
export function ParseDemoCatalogEntry(value: unknown, source: string): IDemoCatalogEntry {
    const entry = RequireRecord(value, "entry", source);
    for (const field of ["id", "title", "summary"]) {
        if (typeof entry[field] !== "string" || entry[field].length === 0) {
            throw new Error(`Demo catalog entry "${source}" must contain a non-empty string at "${field}".`);
        }
    }

    for (const field of ["tags", "resourceLanes", "resources", "assets", "textureBindings", "materialTargets", "selections", "selectionOwners", "expectedLosses"]) {
        RequireArray(entry[field], field, source);
    }

    const editor = RequireRecord(entry.editor, "editor", source);
    for (const field of ["blocks", "frames", "lossBadges"]) {
        RequireArray(editor[field], `editor.${field}`, source);
    }

    const graph = entry.graph;
    if (!Array.isArray(graph)) {
        const serializedGraph = RequireRecord(graph, "graph", source);
        RequireArray(serializedGraph.blocks, "graph.blocks", source);
        RequireArray(serializedGraph.connections, "graph.connections", source);
    }

    const availability = RequireRecord(entry.availability, "availability", source);
    if (availability.status !== "available" && availability.status !== "requires-selection-adapter") {
        throw new Error(`Demo catalog entry "${source}" has an unknown availability status.`);
    }

    const teaching = RequireRecord(entry.teaching, "teaching", source);
    if (typeof teaching.order !== "number" || !Number.isInteger(teaching.order) || teaching.order < 1 || teaching.order > 8) {
        throw new Error(`Demo catalog entry "${source}" must contain a teaching order from 1 through 8.`);
    }

    return entry as IDemoCatalogEntry;
}

const JsonEntries: readonly [unknown, ...unknown[]] = [
    gltfOptimizeDracoBasisu,
    usdToGltf,
    usdToBabylonToGltf,
    babylonMutationToGltf,
    nodeGeometryBoxToGltf,
    textureExtractProcessReinsert,
    mixedGltfNodeGeometryComposition,
    multiDomainMaterialConstruction,
];

/** Catalog entries loaded from the eight checked-in JSON definitions. */
export const DemoCatalogEntries: readonly IDemoCatalogEntry[] = JsonEntries.map((entry) => {
    const parsed = ParseDemoCatalogEntry(entry, IsRecord(entry) && typeof entry.id === "string" ? entry.id : "unknown");
    return parsed;
});

/** Selection capabilities owned by the catalog's source-domain adapters. */
export const DemoCatalogSelectionParity: readonly DemoSelectionOwnerParity[] = [
    {
        ownerRepresentation: "gltf",
        status: "supported",
        targetTypes: ["scene", "node", "mesh", "primitive", "material", "texture", "animation", "skin", "camera", "light", "variant"],
        why: "glTF selections use exact JSON pointers owned by the glTF representation.",
    },
    {
        ownerRepresentation: "usd",
        status: "supported",
        targetTypes: ["stage", "prim", "property", "material", "texture", "animation", "camera", "light", "variant"],
        why: "USD selections use exact prim and property paths owned by the resolved stage representation.",
    },
    {
        ownerRepresentation: "babylon",
        status: "requires-adapter",
        targetTypes: ["scene", "node", "mesh", "material", "texture", "animation", "camera", "light"],
        why: "Babylon selections need an owned resolver/adapter before Babylon can be presented as a peer domain.",
    },
];

/** The canonical registry consumed by gallery and diagram view-model builders. */
export const DemoCatalogRegistry: IDemoCatalog = {
    version: DemoCatalogSchemaVersion,
    selectionParity: DemoCatalogSelectionParity,
    demos: DemoCatalogEntries,
};

/**
 * Looks up a demo by its stable catalog id.
 *
 * @param id - Catalog id supplied by the gallery or an E2E fixture.
 * @returns The entry, or `undefined` when the id is not registered.
 */
export function GetDemoCatalogEntry(id: string): IDemoCatalogEntry | undefined {
    return DemoCatalogRegistry.demos.find((demo) => demo.id === id);
}

/**
 * Looks up a demo and reports an actionable error for an unknown id.
 *
 * @param id - Catalog id supplied by the caller.
 * @returns The registered entry.
 */
export function RequireDemoCatalogEntry(id: string): IDemoCatalogEntry {
    const entry = GetDemoCatalogEntry(id);
    if (!entry) {
        throw new Error(`Unknown Node Assets demo "${id}".`);
    }
    return entry;
}

/** Keeps the representation type available to consumers that only import the catalog module. */
export type DemoCatalogRepresentation = DemoSceneRepresentation;

/** Allows callers that still consume the original type name to assign the JSON-backed catalog. */
export const DemoCatalogJsonRegistry: DemoCatalog = DemoCatalogRegistry;
