import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Tools } from "core/Misc/tools.pure";
import { OBJFileLoader } from "loaders/OBJ/objFileLoader";

describe("OBJFileLoader - shared MTL material and point-cloud rendering", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    // A group with no faces (e.g. an empty placeholder/container object emitted by some
    // exporters) must not force point-cloud rendering onto a sibling group that shares the
    // same MTL material name but does have real face data.
    it("does not force point-cloud rendering on a sibling mesh sharing a material with an empty group", async () => {
        vi.spyOn(Tools, "LoadFile").mockImplementation((_url: any, onSuccess: any) => {
            onSuccess(["newmtl shared", "Kd 0.8 0.8 0.8"].join("\n"));
            return {} as any;
        });

        const obj = [
            "mtllib test.mtl",
            "o EmptyContainer",
            "usemtl shared",
            "o RealMesh",
            "usemtl shared",
            "v -0.5 0 -0.5",
            "v 0.5 0 -0.5",
            "v 0.5 0 0.5",
            "v -0.5 0 0.5",
            "f 1 2 3 4",
        ].join("\n");

        const loader = new OBJFileLoader();
        const container = await loader.loadAssetContainerAsync(scene, obj, "");

        const emptyMesh = container.meshes.find((mesh) => mesh.name === "EmptyContainer");
        const realMesh = container.meshes.find((mesh) => mesh.name === "RealMesh");
        expect(emptyMesh).toBeDefined();
        expect(realMesh).toBeDefined();
        expect(emptyMesh!.getTotalVertices()).toBe(0);
        expect(realMesh!.getTotalVertices()).toBeGreaterThan(0);
        expect(realMesh!.getTotalIndices()).toBeGreaterThan(0);

        // The real mesh has faces, so it must render as a normal solid mesh, not a point cloud,
        // regardless of the empty sibling sharing the same material name.
        expect(realMesh!.material).toBeDefined();
        expect(realMesh!.material!.pointsCloud).toBe(false);

        // The empty container has no geometry to draw either way, so it is left on the shared
        // material unmodified rather than needlessly cloned.
        expect(emptyMesh!.material).toBe(realMesh!.material);
        expect(container.materials.length).toBe(1);
    });

    // Multiple empty containers sharing the same material as several real meshes (the shape of
    // the UR10 and Hospital Bed OBJ sidecars: one 0-vertex placeholder per named part, paired
    // with a same-named real mesh) must not corrupt the shared material for any of them.
    it("keeps multiple real meshes solid when several empty containers share their material", async () => {
        vi.spyOn(Tools, "LoadFile").mockImplementation((_url: any, onSuccess: any) => {
            onSuccess(["newmtl shared", "Kd 0.8 0.8 0.8"].join("\n"));
            return {} as any;
        });

        const obj = [
            "mtllib test.mtl",
            "o Part1",
            "usemtl shared",
            "o Part1",
            "usemtl shared",
            "v -0.5 0 -0.5",
            "v 0.5 0 -0.5",
            "v 0.5 0 0.5",
            "v -0.5 0 0.5",
            "f 1 2 3 4",
            "o Part2",
            "usemtl shared",
            "o Part2",
            "usemtl shared",
            "v -1 0 -1",
            "v 1 0 -1",
            "v 1 0 1",
            "v -1 0 1",
            "f 5 6 7 8",
        ].join("\n");

        const loader = new OBJFileLoader();
        const container = await loader.loadAssetContainerAsync(scene, obj, "");

        const realMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        expect(realMeshes.length).toBe(2);
        for (const mesh of realMeshes) {
            expect(mesh.material).toBeDefined();
            expect(mesh.material!.pointsCloud).toBe(false);
        }
        expect(container.materials.length).toBe(1);
    });
});
