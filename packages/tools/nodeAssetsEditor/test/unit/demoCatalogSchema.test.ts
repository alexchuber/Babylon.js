import { describe, expect, it } from "vitest";

import {
    DemoCatalogSchemaVersion,
    DemoLossPolicy,
    DemoResourceKind,
    IsNodeGeometryResource,
    IsRealizeNodeGeometryNode,
    type DemoCatalog,
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
                    output: "geometry",
                },
                {
                    kind: "RealizeNodeGeometry",
                    scene: "babylonScene",
                    geometry: "geometry",
                    meshName: "Box",
                    evaluation: { mode: "explicit" },
                },
            ],
            editor: {
                blocks: [],
                frames: [],
            },
            assets: [],
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
            expectedLosses: [
                {
                    feature: "USD variants",
                    policy: DemoLossPolicy.DROP,
                    severity: "warning",
                    why: "The glTF scene spine has no equivalent variant-set model.",
                },
                {
                    feature: "Custom material metadata",
                    policy: DemoLossPolicy.EXTENSION,
                    extension: "EXT_demo_metadata",
                    severity: "info",
                    why: "The metadata is carried in a target extension.",
                },
            ],
            domainTags: {
                handedness: "right",
                unit: "meters",
                upAxis: "Y",
            },
            nodeGeometry: {
                status: "not-applicable",
                why: "This pipeline demo does not contain a NodeGeometry resource.",
            },
            expectedOutcome: {
                description: "The converted scene is available in the glTF terminal preview.",
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
    });

    it("treats NodeGeometry as a resource and marks evaluation on realization", () => {
        expect(IsNodeGeometryResource(nodeGeometryResource)).toBe(true);
        expect("evaluation" in nodeGeometryResource).toBe(false);
        expect(inlineNodeGeometryResource.source).toEqual({
            kind: "inlineJson",
            json: { blocks: [], metadata: { name: "box" } },
        });

        const realization = catalog.demos[0].graph[1];
        expect(IsRealizeNodeGeometryNode(realization)).toBe(true);
        expect(realization.evaluation).toEqual({
            mode: "explicit",
        });
        expect(catalog.demos[0].nodeGeometry).toMatchObject({
            status: "not-applicable",
        });
    });
});
