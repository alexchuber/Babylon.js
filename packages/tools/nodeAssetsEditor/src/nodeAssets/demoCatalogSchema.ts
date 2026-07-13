/**
 * Shared metadata contract for Node Assets Editor demos.
 *
 * The graph payload is intentionally not part of this contract. A demo can
 * describe a graph built by the editor or by another authoring tool while
 * keeping its resource, domain, and transcoding expectations inspectable.
 */

/** Current version of the demo catalog metadata contract. */
export const DemoCatalogSchemaVersion = 1 as const;

/** Scene representations that can be connected by a transcoder. */
export const DemoSceneRepresentation = {
    GLTF: "gltf",
    USD: "usd",
    BABYLON: "babylon",
} as const;

/** A scene representation supported by a demo resource. */
export type DemoSceneRepresentation = (typeof DemoSceneRepresentation)[keyof typeof DemoSceneRepresentation];

/** Kinds of resources that can participate in a demo. */
export const DemoResourceKind = {
    GLTF: DemoSceneRepresentation.GLTF,
    USD: DemoSceneRepresentation.USD,
    BABYLON: DemoSceneRepresentation.BABYLON,
    IMAGE: "image",
    NODE_GEOMETRY: "nodeGeometry",
} as const;

/** A resource kind supported by the demo catalog. */
export type DemoResourceKind = (typeof DemoResourceKind)[keyof typeof DemoResourceKind];

/** Policies a transcoder may apply to a feature that does not map directly. */
export const DemoLossPolicy = {
    PRESERVE: "preserve",
    BAKE: "bake",
    DROP: "drop",
    EXTENSION: "extension",
} as const;

/** A structured policy for an expected conversion loss. */
export type DemoLossPolicy = (typeof DemoLossPolicy)[keyof typeof DemoLossPolicy];

/** Severity shown for an expected conversion diagnostic. */
export const DemoLossSeverity = {
    INFO: "info",
    WARNING: "warning",
    ERROR: "error",
} as const;

/** Severity of an expected conversion diagnostic. */
export type DemoLossSeverity = (typeof DemoLossSeverity)[keyof typeof DemoLossSeverity];

/** Coordinate handedness values used by scene resources. */
export const DemoHandedness = {
    LEFT: "left",
    RIGHT: "right",
} as const;

/** Coordinate handedness used by a scene resource or demo. */
export type DemoHandedness = (typeof DemoHandedness)[keyof typeof DemoHandedness];

/** Axis identifiers used by the up-axis domain tag. */
export const DemoUpAxis = {
    X: "x",
    Y: "y",
    Z: "z",
} as const;

/** Up axis used by a scene resource or demo. */
export type DemoUpAxis = (typeof DemoUpAxis)[keyof typeof DemoUpAxis];

/** Domain conventions that a demo or one of its resources expects. */
export type DemoDomainTags = {
    /** Coordinate handedness. */
    readonly handedness?: DemoHandedness;
    /** Unit name, such as `meters`, `centimeters`, or a source-specific unit. */
    readonly unit?: string;
    /** Positive axis treated as up by the source or target domain. */
    readonly upAxis?: DemoUpAxis;
};

/** A URL-backed resource source. */
export type DemoUrlSource = {
    readonly kind: "url";
    readonly url: string;
};

/** A snippet-server-backed resource source. */
export type DemoSnippetSource = {
    readonly kind: "snippet";
    readonly snippetId: string;
};

/** An inline serialized resource source. */
export type DemoInlineSource = {
    readonly kind: "inline";
    readonly value: string;
};

/** Ways a demo resource can be loaded. */
export type DemoResourceSource = DemoUrlSource | DemoSnippetSource | DemoInlineSource;

/** Common metadata for a demo resource. */
export type DemoResourceBase = {
    /** Stable identifier used by the demo graph or UI. */
    readonly id: string;
    /** Human-readable resource name. */
    readonly label: string;
    /** Location or serialized value used to load the resource. */
    readonly source: DemoResourceSource;
    /** Conventions for this resource, when they differ from the demo defaults. */
    readonly domainTags?: DemoDomainTags;
    /** Loss diagnostics scoped to the conversion that produces this resource. */
    readonly expectedLosses?: readonly DemoLossDiagnostic[];
};

/** A glTF, USD, or Babylon scene resource. */
export type DemoSceneResource = DemoResourceBase & {
    readonly kind: DemoSceneRepresentation;
};

/** An image resource that can be embedded in a scene representation. */
export type DemoImageResource = DemoResourceBase & {
    readonly kind: typeof DemoResourceKind.IMAGE;
};

/**
 * Explicit evaluation required to materialize a NodeGeometry resource.
 *
 * NodeGeometry is not a passive serialized asset: its graph must be built
 * before the resulting geometry can be consumed by a demo pipeline.
 */
export type DemoNodeGeometryEvaluation = {
    readonly required: true;
    readonly mode: "explicit";
    readonly operation: "build";
};

/** A NodeGeometry resource, including its required build step. */
export type DemoNodeGeometryResource = DemoResourceBase & {
    readonly kind: typeof DemoResourceKind.NODE_GEOMETRY;
    readonly evaluation: DemoNodeGeometryEvaluation;
};

/** Any resource that may be listed by a demo. */
export type DemoResource = DemoSceneResource | DemoImageResource | DemoNodeGeometryResource;

/** Base fields shared by all expected loss diagnostics. */
type DemoLossDiagnosticBase = {
    /** Feature whose representation changes at the transcoder boundary. */
    readonly feature: string;
    /** Severity presented to the demo author. */
    readonly severity: DemoLossSeverity;
    /** Why this policy is expected and what the author should know. */
    readonly why: string;
};

/** An expected loss handled without a named extension. */
export type DemoExpectedLossDiagnostic = DemoLossDiagnosticBase & {
    readonly policy: Exclude<DemoLossPolicy, typeof DemoLossPolicy.EXTENSION>;
};

/** An expected loss preserved through a named target extension. */
export type DemoExtensionLossDiagnostic = DemoLossDiagnosticBase & {
    readonly policy: typeof DemoLossPolicy.EXTENSION;
    /** Extension that carries the feature across the boundary. */
    readonly extension: string;
};

/** A structured, expected conversion-loss diagnostic. */
export type DemoLossDiagnostic = DemoExpectedLossDiagnostic | DemoExtensionLossDiagnostic;

/** Metadata for one browseable pipeline demo. */
export type DemoDefinition = {
    /** Stable catalog identifier. */
    readonly id: string;
    /** Human-readable title. */
    readonly title: string;
    /** Short explanation of the scenario and its intended outcome. */
    readonly description: string;
    /** Search and filter labels shown by the demo gallery. */
    readonly tags: readonly string[];
    /** Resources required to construct the demo graph. */
    readonly resources: readonly DemoResource[];
    /** Conversion expectations for the demo as a whole. */
    readonly expectedLosses: readonly DemoLossDiagnostic[];
    /** Default conventions for the demo's active domain. */
    readonly domainTags?: DemoDomainTags;
};

/** A versioned collection of browseable pipeline demos. */
export type DemoCatalog = {
    /** Schema version used to interpret this catalog. */
    readonly version: typeof DemoCatalogSchemaVersion;
    /** Demo entries in gallery order. */
    readonly demos: readonly DemoDefinition[];
};

/**
 * Narrows a resource to NodeGeometry and therefore exposes its required build
 * evaluation metadata.
 *
 * @param resource - Resource to inspect.
 * @returns `true` when the resource is NodeGeometry.
 */
export function IsNodeGeometryResource(resource: DemoResource): resource is DemoNodeGeometryResource {
    return resource.kind === DemoResourceKind.NODE_GEOMETRY;
}
