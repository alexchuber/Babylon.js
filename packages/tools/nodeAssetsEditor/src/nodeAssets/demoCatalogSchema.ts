/**
 * Shared metadata contract for Node Assets Editor demos.
 *
 * The graph is represented as declarative node descriptors so resource
 * realization steps remain inspectable alongside domain and transcoding
 * expectations.
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

/** An inline JSON resource source, used by serialized graph resources. */
export type DemoInlineJsonSource = {
    readonly kind: "inlineJson";
    readonly json: string;
};

/** A file-backed resource source. */
export type DemoFileSource = {
    readonly kind: "file";
    readonly path: string;
    readonly name?: string;
};

/** Ways a demo resource can be loaded. */
export type DemoResourceSource = DemoUrlSource | DemoSnippetSource | DemoInlineSource | DemoInlineJsonSource | DemoFileSource;

/** Common metadata for a demo resource. */
export type DemoResourceBase = {
    /** Stable identifier used by the demo graph or UI. */
    readonly id: string;
    /** Human-readable resource name. */
    readonly label: string;
    /** Location or serialized value used to load the resource. */
    readonly source: DemoResourceSource;
    /** Source format identifier when it is more specific than the resource kind. */
    readonly format?: string;
    /** Display label for the authored source. */
    readonly sourceLabel?: string;
    /** Optional snippet identifier retained as catalog metadata. */
    readonly snippetId?: string;
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
 * A serialized NodeGeometry graph resource.
 *
 * Evaluation is deliberately not stored on the resource. The graph's
 * `RealizeNodeGeometry` node owns the explicit build-and-attach boundary.
 */
export type DemoNodeGeometryResource = DemoResourceBase & {
    readonly kind: typeof DemoResourceKind.NODE_GEOMETRY;
    readonly format: "babylon-node-geometry";
};

/** Any resource that may be listed by a demo. */
export type DemoResource = DemoSceneResource | DemoImageResource | DemoNodeGeometryResource;

/** An import node that exposes a NodeGeometry resource as geometry data. */
export type DemoImportNodeGeometryNode = {
    readonly kind: "ImportNodeGeometry";
    readonly resourceId: string;
    readonly output: string;
};

/**
 * An explicit NodeGeometry realization node.
 *
 * Importing a serialized NodeGeometry graph does not attach a mesh to a
 * Babylon scene. This node represents the required `build()` and
 * `createMesh()` boundary.
 */
export type DemoRealizeNodeGeometryNode = {
    readonly kind: "RealizeNodeGeometry";
    readonly scene: string;
    readonly geometry: string;
    readonly meshName: string;
    readonly evaluation: {
        readonly mode: "explicit";
    };
};

/** A graph node supplied by another editor or a future Node Assets block. */
export type DemoGenericGraphNode = {
    readonly kind: string;
    readonly [property: string]: unknown;
};

/** Declarative node descriptor accepted by a demo graph. */
export type DemoGraphNode = DemoImportNodeGeometryNode | DemoRealizeNodeGeometryNode | DemoGenericGraphNode;

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
    /** Declarative graph nodes and their resource references. */
    readonly graph: readonly DemoGraphNode[];
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
 * Narrows a resource to NodeGeometry. The resource is serialized data only;
 * use {@link IsRealizeNodeGeometryNode} to inspect its explicit evaluation
 * boundary.
 *
 * @param resource - Resource to inspect.
 * @returns `true` when the resource is NodeGeometry.
 */
export function IsNodeGeometryResource(resource: DemoResource): resource is DemoNodeGeometryResource {
    return resource.kind === DemoResourceKind.NODE_GEOMETRY;
}

/**
 * Narrows a graph node to the explicit NodeGeometry realization boundary.
 *
 * @param node - Graph node to inspect.
 * @returns `true` when the node realizes NodeGeometry into a Babylon scene.
 */
export function IsRealizeNodeGeometryNode(node: DemoGraphNode): node is DemoRealizeNodeGeometryNode {
    return node.kind === "RealizeNodeGeometry";
}
