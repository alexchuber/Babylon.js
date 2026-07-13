import { describe, expect, it } from "vitest";

import {
    DemoCatalogSchemaVersion,
    DemoAssetRole,
    DemoLossPolicy,
    DemoResourceKind,
    DemoTeachingConcept,
    IsBakeNodeGeometryNode,
    IsEvaluateNodeGeometryNode,
    IsNodeGeometryResource,
    type DemoCatalog,
    type DemoLossDiagnostic,
    type DemoNodeGeometryResource,
} from "../../src/nodeAssets/demoCatalog";

const nodeGeometryResource: DemoNodeGeometryResource = {
    id: "geometry",
    label: "Generated geometry",
    kind: DemoResourceKind.NODE_GEOMETRY,
    format: "babylon-node-geometry",
    source: { kind: "snippet", snippetId: "PYY6XE#69" },
};

const inlineNodeGeometryResource: DemoNodeGeometryResource = {
    id: "inline-geometry",
    label: "Inline generated geometry",
    kind: DemoResourceKind.NODE_GEOMETRY,
    format: "babylon-node-geometry",
    source: {
        kind: "inlineJson",
        json: { blocks: [], metadata: { name: "box" } },
    },
};

const expectedLosses: readonly DemoLossDiagnostic[] = [
    {
        id: "usd-variants",
        feature: "USD variants",
        policy: DemoLossPolicy.DROP,
        severity: "warning",
        why: "The glTF scene spine has no equivalent variant-set model.",
    },
    {
        id: "custom-material-metadata",
        feature: "Custom material metadata",
        policy: DemoLossPolicy.EXTENSION,
        extension: "EXT_demo_metadata",
        severity: "info",
        why: "The metadata is carried in a target extension.",
    },
];

const catalog: DemoCatalog = {
    version: DemoCatalogSchemaVersion,
    demos: [
        {
            id: "usd-to-gltf",
            title: "USD to glTF",
            summary: "Transcode a USD scene to the glTF scene spine.",
            description: "Transcode a USD scene to the glTF scene spine.",
            tags: ["usd", "gltf", "transcoding"],
            resources: [
                {
                    id: "source",
                    label: "Source scene",
                    kind: DemoResourceKind.USD,
                    source: { kind: "url", url: "https://example.test/source.usd" },
                    domainTags: {
                        handedness: "right",
                        unit: "meters",
                        upAxis: "Y",
                    },
                },
                nodeGeometryResource,
                inlineNodeGeometryResource,
            ],
            graph: [
                {
                    kind: "ImportNodeGeometry",
                    resourceId: "geometry",
                    output: "proceduralGeometry",
                },
                {
                    kind: "EvaluateNodeGeometry",
                    geometry: "proceduralGeometry",
                    output: "vertexData",
                    evaluation: {
                        mode: "explicit",
                        operation: "build",
                    },
                },
                {
                    kind: "BakeNodeGeometry",
                    geometry: "proceduralGeometry",
                    scene: "babylonScene",
                    meshName: "Box",
                    evaluation: {
                        mode: "explicit",
                        operation: "createMesh",
                    },
                },
            ],
            editor: {
                blocks: [],
                frames: [],
                lossBadges: [
                    {
                        diagnosticId: "usd-variants",
                        label: "Variants dropped",
                        severity: "warning",
                        graphNodeIds: [1],
                    },
                    {
                        diagnosticId: "custom-material-metadata",
                        label: "Metadata extension",
                        severity: "info",
                        graphNodeIds: [2],
                    },
                ],
            },
            assets: [
                {
                    blockId: 3,
                    input: "baseColor",
                    bundledAssetKey: "orb-metal",
                    role: DemoAssetRole.BASE_COLOR,
                    mimeType: "image/png",
                    sourceLabel: "Bundled orb metal image",
                },
            ],
            selections: [
                {
                    id: "usd-prim",
                    label: "Orb prim",
                    resolution: {
                        status: "resolved",
                        selection: {
                            domain: "usd",
                            granularity: "prim",
                            valueKind: "primPath",
                            value: "/Root/Orb",
                        },
                    },
                },
                {
                    id: "usd-variant",
                    resolution: {
                        status: "stale",
                        selection: {
                            domain: "usd",
                            granularity: "variant",
                            valueKind: "primPath",
                            value: "/Root/OldVariant",
                        },
                        diagnostic: {
                            status: "stale",
                            why: "The fixture changed after the selection was authored.",
                        },
                    },
                },
                {
                    id: "usd-missing-property",
                    resolution: {
                        status: "dangling",
                        selection: {
                            domain: "usd",
                            granularity: "property",
                            valueKind: "propertyPath",
                            value: "/Root/Orb.visibility",
                        },
                        diagnostic: {
                            status: "dangling",
                            why: "The property does not exist in this stage.",
                        },
                    },
                },
                {
                    id: "optional-camera",
                    resolution: {
                        status: "empty",
                        diagnostic: {
                            status: "empty",
                            why: "This demo intentionally leaves camera selection unset.",
                        },
                    },
                },
            ],
            terminal: {
                kind: "gltf",
                expectedMimeType: "model/gltf-binary",
            },
            conventions: {
                handedness: "preserved",
                unit: "meter",
                upAxis: "converted",
                unitScale: 0.01,
            },
            expectedLosses,
            domainTags: {
                handedness: "right",
                unit: "meters",
                upAxis: "Y",
            },
            nodeGeometry: {
                status: "requires-adapter",
                proceduralUntil: "BakeNodeGeometry",
                why: "The catalog can describe the visible evaluation boundary before a runtime adapter exists.",
            },
            expectedOutcome: {
                description: "The converted scene is available in the glTF terminal preview.",
            },
            preExportReview: {
                visibility: "before-terminal-export",
                beforeExportNodeId: 4,
                physicalMetadata: {
                    handedness: "preserved",
                    unit: "meter",
                    upAxis: "converted",
                    unitScale: 0.01,
                },
                accumulatedLosses: expectedLosses,
            },
            teaching: {
                order: 1,
                concepts: [
                    DemoTeachingConcept.DOMAIN_SELECTIONS,
                    DemoTeachingConcept.SELECTION_DIAGNOSTICS,
                    DemoTeachingConcept.EXPECTED_LOSSES,
                    DemoTeachingConcept.IMAGE_BINDINGS,
                    DemoTeachingConcept.NODE_GEOMETRY_EVALUATION,
                    DemoTeachingConcept.PRE_EXPORT_REVIEW,
                    DemoTeachingConcept.GRAPH_LAYOUT,
                ],
                takeaway: "Inspect exact source selections, visible losses, and physical metadata before export.",
                focus: {
                    frameIds: ["frame-source", "frame-export"],
                    blockIds: [1, 2, 3, 4],
                },
            },
        },
    ],
};

describe("demo catalog schema", () => {
    it("supports structured expected-loss diagnostics and domain tags", () => {
        const demo = catalog.demos[0];

        expect(demo.expectedLosses).toHaveLength(2);
        expect(demo.expectedLosses[0]).toMatchObject({
            policy: "drop",
            severity: "warning",
        });
        expect(demo.domainTags).toEqual({
            handedness: "right",
            unit: "meters",
            upAxis: "Y",
        });
        expect(demo.conventions).toMatchObject({
            upAxis: "converted",
            unitScale: 0.01,
        });
        expect(demo.selections.map(({ resolution }) => resolution.status)).toEqual(["resolved", "stale", "dangling", "empty"]);
        expect(demo.editor.lossBadges).toMatchObject([
            { diagnosticId: "usd-variants", severity: "warning" },
            { diagnosticId: "custom-material-metadata", severity: "info" },
        ]);
        expect(demo.preExportReview).toMatchObject({
            visibility: "before-terminal-export",
            beforeExportNodeId: 4,
            accumulatedLosses: expectedLosses,
        });
    });

    it("treats NodeGeometry as procedural until an explicit evaluation or bake node", () => {
        expect(IsNodeGeometryResource(nodeGeometryResource)).toBe(true);
        expect("evaluation" in nodeGeometryResource).toBe(false);
        expect(inlineNodeGeometryResource.source).toEqual({
            kind: "inlineJson",
            json: { blocks: [], metadata: { name: "box" } },
        });

        const evaluation = catalog.demos[0].graph[1];
        expect(IsEvaluateNodeGeometryNode(evaluation)).toBe(true);
        expect(evaluation.evaluation).toEqual({
            mode: "explicit",
            operation: "build",
        });
        const bake = catalog.demos[0].graph[2];
        expect(IsBakeNodeGeometryNode(bake)).toBe(true);
        expect(bake.evaluation).toEqual({
            mode: "explicit",
            operation: "createMesh",
        });
        expect(catalog.demos[0].nodeGeometry).toMatchObject({
            status: "requires-adapter",
            proceduralUntil: "BakeNodeGeometry",
        });
    });
});
