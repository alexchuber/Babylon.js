import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { RoomAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

function importRoomAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(RoomAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: RoomAsset.fileName,
    });
}

function resolveRoom() {
    return ResolveUsdStageAsync(readRuntimeCorpusText(RoomAsset.fileName), "", RoomAsset.fileName, {});
}

const ROOM_PARTS = ["Floor", "BackWall", "LeftWall", "RightWall", "FrontWallLeft", "FrontWallRight"] as const;

// Authored transforms from Room.usda. The Cube prims have no authored size, so
// USD's default size=2 applies (half-extent=1). Scale values are multipliers on
// [-1,1], making actual rendered dimensions double the scale values. Source
// comments describe legacy intent but authored USD default size=2 governs.
const EXPECTED_TRANSFORMS: Record<string, { position: [number, number, number]; scaling: [number, number, number] }> = {
    Floor: { position: [0, 0.05, 0], scaling: [15, 0.1, 15] },
    BackWall: { position: [0, 3, -7.5], scaling: [15, 6, 0.25] },
    LeftWall: { position: [-7.5, 3, 0], scaling: [0.25, 6, 15] },
    RightWall: { position: [7.5, 3, 0], scaling: [0.25, 6, 15] },
    FrontWallLeft: { position: [-4.5, 3, 7.5], scaling: [6, 6, 0.25] },
    FrontWallRight: { position: [4.5, 3, 7.5], scaling: [6, 6, 0.25] },
};

describe("USD runtime corpus - Room", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    // -- Public API: hierarchy --

    it("loads through ImportMeshAsync with the expected Room hierarchy", async () => {
        const result = await importRoomAsync(scene);

        const roomNode = result.transformNodes.find((n) => n.name === "Room");
        expect(roomNode).toBeDefined();

        for (const partName of ROOM_PARTS) {
            const partNode = result.transformNodes.find((n) => n.name === partName);
            expect(partNode, `expected transform node '${partName}'`).toBeDefined();
            expect(partNode!.parent?.name).toBe("Room");
        }
    });

    it("produces exactly 6 renderable Cube meshes all named geom", async () => {
        const result = await importRoomAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(6);

        for (const mesh of renderableMeshes) {
            expect(mesh.name).toBe("geom");
            expect(mesh.getTotalVertices()).toBe(24);
            expect(mesh.getTotalIndices()).toBe(36);
        }
    });

    it("parents each geom mesh under its corresponding room part", async () => {
        const result = await importRoomAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        const parentNames = new Set(renderableMeshes.map((m) => m.parent?.name));
        for (const partName of ROOM_PARTS) {
            expect(parentNames.has(partName), `geom should be parented under '${partName}'`).toBe(true);
        }
    });

    // -- Public API: TransformNode position/scaling --

    it("sets exact Babylon position and scaling on every room-part TransformNode", async () => {
        const result = await importRoomAsync(scene);

        for (const [partName, exp] of Object.entries(EXPECTED_TRANSFORMS)) {
            const tn = result.transformNodes.find((n) => n.name === partName);
            expect(tn, `expected TransformNode '${partName}'`).toBeDefined();

            expect(tn!.position.x).toBeCloseTo(exp.position[0], 2);
            expect(tn!.position.y).toBeCloseTo(exp.position[1], 2);
            expect(tn!.position.z).toBeCloseTo(exp.position[2], 2);

            expect(tn!.scaling.x).toBeCloseTo(exp.scaling[0], 2);
            expect(tn!.scaling.y).toBeCloseTo(exp.scaling[1], 2);
            expect(tn!.scaling.z).toBeCloseTo(exp.scaling[2], 2);
        }
    });

    // -- Public API: front wall overlap (authored USD semantics) --

    it("models the front wall as two overlapping segments with a 3-unit overlap", async () => {
        // Source comments describe legacy intent of a door gap, but with default
        // UsdGeomCube size=2 (half-extent=1) the scale values are multipliers on
        // [-1,1]. FrontWallLeft at X=-4.5 with scale X=6 spans [-10.5, 1.5].
        // FrontWallRight at X=4.5 with scale X=6 spans [-1.5, 10.5]. They overlap
        // from X=-1.5 to X=1.5, a 3-unit overlap. Authored USD wins.
        const result = await importRoomAsync(scene);

        const leftTN = result.transformNodes.find((n) => n.name === "FrontWallLeft");
        const rightTN = result.transformNodes.find((n) => n.name === "FrontWallRight");
        expect(leftTN).toBeDefined();
        expect(rightTN).toBeDefined();

        // Half-extent of the Cube mesh = 1 (default size=2). World X extent =
        // position.x ± scaling.x * 1.
        const leftMaxX = leftTN!.position.x + leftTN!.scaling.x; // -4.5 + 6 = 1.5
        const rightMinX = rightTN!.position.x - rightTN!.scaling.x; // 4.5 - 6 = -1.5

        // Overlap = leftMaxX - rightMinX when leftMaxX > rightMinX
        const overlap = leftMaxX - rightMinX;
        expect(overlap).toBeCloseTo(3.0);
        expect(leftMaxX).toBeGreaterThan(rightMinX);
    });

    // -- Public API: color buffers and opacity --

    it("exposes Floor vertex colors (0.72, 0.74, 0.78) with alpha 0.5 through the public mesh", async () => {
        const result = await importRoomAsync(scene);

        const floorMesh = result.meshes.find((m) => m.parent?.name === "Floor" && m.getTotalVertices() > 0);
        expect(floorMesh).toBeDefined();

        const colors = floorMesh!.getVerticesData(VertexBuffer.ColorKind);
        expect(colors).toBeDefined();
        expect(colors![0]).toBeCloseTo(0.72, 1);
        expect(colors![1]).toBeCloseTo(0.74, 1);
        expect(colors![2]).toBeCloseTo(0.78, 1);
        expect(colors![3]).toBeCloseTo(0.5, 1);
    });

    it("exposes wall vertex colors (0.75, 0.77, 0.81) with alpha 0.5 on all wall meshes", async () => {
        const result = await importRoomAsync(scene);

        const wallNames = ["BackWall", "LeftWall", "RightWall", "FrontWallLeft", "FrontWallRight"];
        for (const wallName of wallNames) {
            const mesh = result.meshes.find((m) => m.parent?.name === wallName && m.getTotalVertices() > 0);
            expect(mesh, `expected renderable mesh under '${wallName}'`).toBeDefined();

            const colors = mesh!.getVerticesData(VertexBuffer.ColorKind);
            expect(colors).toBeDefined();
            expect(colors![0]).toBeCloseTo(0.75, 1);
            expect(colors![1]).toBeCloseTo(0.77, 1);
            expect(colors![2]).toBeCloseTo(0.81, 1);
            expect(colors![3]).toBeCloseTo(0.5, 1);
        }
    });

    // -- Public API: aggregate world bounds --

    it("produces aggregate Babylon world bounds X/Z [-15,15], Y [-3,9]", async () => {
        // With default UsdGeomCube size=2, the scale values are multipliers on
        // half-extent=1. Floor scale (15,0.1,15) → actual 30×0.2×30.
        // Aggregate world bounds span the full room.
        const result = await importRoomAsync(scene);

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (const mesh of result.meshes) {
            mesh.computeWorldMatrix(true);
            const bb = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        }

        expect(minX).toBeCloseTo(-15, 0);
        expect(maxX).toBeCloseTo(15, 0);
        expect(minY).toBeCloseTo(-3, 0);
        expect(maxY).toBeCloseTo(9, 0);
        expect(minZ).toBeCloseTo(-15, 0);
        expect(maxZ).toBeCloseTo(15, 0);
    });

    // -- Supplemental: resolution-layer assertions --

    it("resolves authored transforms on all six room parts", async () => {
        const stage = await resolveRoom();
        const roomPrim = stage.root.children[0];

        for (const [partName, exp] of Object.entries(EXPECTED_TRANSFORMS)) {
            const part = roomPrim.children.find((c) => c.name === partName);
            expect(part, `expected prim '${partName}'`).toBeDefined();

            for (let i = 0; i < 3; i++) {
                expect(part!.transform.translation[i]).toBeCloseTo(exp.position[i], 2);
                expect(part!.transform.scale[i]).toBeCloseTo(exp.scaling[i], 2);
            }
        }
    });

    it("resolves Floor display color (0.72, 0.74, 0.78) with 50% opacity at the resolution layer", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];
        const floorPart = roomPrim.children.find((c) => c.name === "Floor");
        const geomPrim = floorPart?.children.find((c) => c.kind === "mesh");
        expect(geomPrim).toBeDefined();

        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeDefined();
        expect(mesh.colors![0]).toBeCloseTo(0.72);
        expect(mesh.colors![1]).toBeCloseTo(0.74);
        expect(mesh.colors![2]).toBeCloseTo(0.78);
        expect(mesh.colors![3]).toBeCloseTo(0.5);
    });

    it("resolves wall display color (0.75, 0.77, 0.81) with 50% opacity on all wall parts", async () => {
        const stage = await resolveRoom();

        const roomPrim = stage.root.children[0];
        const wallNames = ["BackWall", "LeftWall", "RightWall", "FrontWallLeft", "FrontWallRight"];

        for (const wallName of wallNames) {
            const wallPart = roomPrim.children.find((c) => c.name === wallName);
            const geomPrim = wallPart?.children.find((c) => c.kind === "mesh");
            expect(geomPrim, `expected mesh prim under '${wallName}'`).toBeDefined();

            const mesh = stage.meshes[geomPrim!.meshIndex!];
            expect(mesh.colors).toBeDefined();
            expect(mesh.colors![0]).toBeCloseTo(0.75);
            expect(mesh.colors![1]).toBeCloseTo(0.77);
            expect(mesh.colors![2]).toBeCloseTo(0.81);
            expect(mesh.colors![3]).toBeCloseTo(0.5);
        }
    });

    it("does not emit unsupported-Cube diagnostics for valid Room Cube input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importRoomAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cube prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    it("uses subdivisionScheme 'none' on all resolved Cube meshes", async () => {
        const stage = await resolveRoom();

        for (const mesh of stage.meshes) {
            expect(mesh.subdivisionScheme).toBe("none");
        }
    });

    it("produces 24 vertices and 36 indices per Cube mesh (shared Cube geometry)", async () => {
        const stage = await resolveRoom();

        for (const mesh of stage.meshes) {
            expect(mesh.positions.length).toBe(24 * 3);
            expect(mesh.indices.length).toBe(36);
            expect(mesh.normals).toBeDefined();
            expect(mesh.normals!.length).toBe(24 * 3);
        }
    });
});
