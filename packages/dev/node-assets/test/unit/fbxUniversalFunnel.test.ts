import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { FBXToUniversalBlock } from "../../src/Blocks/fbxToUniversalBlock";
import { ImportFBXAggregateBlock } from "../../src/Blocks/importFBXAggregateBlock";
import { ReadFBXBlock } from "../../src/Blocks/readFBXBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { BuildCancelledError, GetNodeAssetBuildReport } from "../../src/evaluation/buildScope";
import { NodeAsset } from "../../src/nodeAsset";
import {
  GetGltfAsset,
  type GltfAsset,
} from "../../src/representations/gltfAsset";
import { CreateAsciiFbx74TriangleFixture, CreateBinaryFbx74TriangleFixture, CreateBinaryFbx75TriangleFixture } from "./testFbxSource";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

function CreateDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

class CaptureUniversalManifestBlock extends NodeAssetBlock {
  public static override ClassName = "CaptureUniversalManifestBlock";

  public readonly input: NodeAssetConnectionPoint;
  public readonly output: NodeAssetConnectionPoint;
  public manifest: GltfAsset["manifest"] | undefined;

  public constructor(name: string, nodeAsset: NodeAsset) {
    super(name, nodeAsset);
    this.input = this._registerInput(
      "input",
      NodeAssetConnectionPointType.UNIVERSAL,
    );
    this.output = this._registerOutput(
      "output",
      NodeAssetConnectionPointType.UNIVERSAL,
    );
  }

  public override async _buildBlockAsync(): Promise<void> {
    const asset = GetGltfAsset(this.input.value, this.input.name);
    this.manifest = asset.manifest;
    this.output.value = asset;
  }
}

async function ReadStableMeshFactsAsync(glb: Uint8Array): Promise<{
  readonly meshCount: number;
  readonly nodeNames: readonly string[];
  readonly positionCount: number;
  readonly indexCount: number;
}> {
  const document = await new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .readBinary(glb);
  const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
  return {
    meshCount: document.getRoot().listMeshes().length,
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    positionCount: primitive?.getAttribute("POSITION")?.getCount() ?? 0,
    indexCount: primitive?.getIndices()?.getCount() ?? 0,
  };
}

describe("FBX Universal funnel", () => {
  function CreateExportingAsset(data?: Uint8Array): NodeAsset {
    const asset = new NodeAsset("fbx-errors");
    const read = new ReadFBXBlock("Read FBX", asset);
    if (data) {
      read.setUploadedSource(data, "triangle.fbx");
    }
    const toUniversal = new FBXToUniversalBlock("FBX \u2192 Universal", asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    read.output.connectTo(toUniversal.input);
    toUniversal.output.connectTo(exporter.input);
    return asset;
  }

  it("loads a URL through an injectable fetcher and retains its Babylon folder root", async () => {
    const source = CreateAsciiFbx74TriangleFixture();
    const asset = new NodeAsset("url-fbx-source");
    const read = new ReadFBXBlock("Read FBX", asset);
    read.setUploadedSource(new Uint8Array([1, 2, 3]), "previous.fbx");
    const url = "https://cdn.example.com/models/triangle.fbx?token=abc/def";
    const fetcher = vi.fn(async (requestedUrl: string) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => source.slice().buffer,
    }));

    const request = read.setUrlAsync(url, fetcher);
    expect(read.source).toBe("previous.fbx");
    expect(read.sourceKind).toBe("upload");
    await request;
    await read._buildBlockAsync();

    expect(fetcher).toHaveBeenCalledWith(url);
    expect(read.source).toBe(url);
    expect(read.sourceKind).toBe("url");
    expect(read.output.value).toMatchObject({
      source: url,
      rootUrl: "https://cdn.example.com/models/",
    });
  });

  it("preserves the last successful source when the current URL fails and makes older URL success inert", async () => {
    const asset = new NodeAsset("racing-fbx-sources");
    const read = new ReadFBXBlock("Read FBX", asset);
    const previousBytes = new Uint8Array([4, 5, 6]);
    read.setUploadedSource(previousBytes, "previous.fbx");

    await expect(
      read.setUrlAsync("https://cdn.example.com/current.fbx", async () => ({
        ok: false,
        status: 503,
        statusText: "Unavailable",
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    ).rejects.toThrow(/503 Unavailable/);
    expect(read.data).toEqual(previousBytes);
    expect(read.source).toBe("previous.fbx");
    expect(read.sourceKind).toBe("upload");

    const olderResponse = CreateDeferred<{
      readonly ok: boolean;
      readonly status: number;
      readonly statusText: string;
      arrayBuffer(): Promise<ArrayBuffer>;
    }>();
    const olderRequest = read.setUrlAsync(
      "https://cdn.example.com/older.fbx",
      async () => await olderResponse.promise,
    );
    const newerRequest = read.setUrlAsync(
      "https://cdn.example.com/newer.fbx",
      async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    await expect(newerRequest).rejects.toThrow(/404 Not Found/);
    olderResponse.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
    });
    await olderRequest;

    expect(read.data).toEqual(previousBytes);
    expect(read.source).toBe("previous.fbx");
    expect(read.sourceKind).toBe("upload");
  });

  it("honors source ownership guards and reports only winning URL or upload results", async () => {
    const asset = new NodeAsset("owned-fbx-sources");
    const read = new ReadFBXBlock("Read FBX", asset);
    const winner = { applied: false };
    await read.setUrlAsync(
      "https://cdn.example.com/winner.fbx",
      async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
      () => true,
      winner,
    );
    expect(winner.applied).toBe(true);

    const detached = { applied: true };
    await expect(
      read.setUrlAsync(
        "https://cdn.example.com/detached.fbx",
        async () => {
          throw new Error("detached request failed");
        },
        () => false,
        detached,
      ),
    ).resolves.toBeUndefined();
    expect(detached.applied).toBe(false);
    expect(read.source).toBe("https://cdn.example.com/winner.fbx");

    const pendingUpload = CreateDeferred<ArrayBuffer>();
    const upload = { applied: true };
    const uploadRequest = read.setUploadedSourceAsync(
      async () => await pendingUpload.promise,
      "older-upload.fbx",
      () => true,
      upload,
    );
    read.setUploadedSource(new Uint8Array([7, 8, 9]), "newer-upload.fbx");
    pendingUpload.resolve(new Uint8Array([4, 5, 6]).buffer);
    await uploadRequest;

    expect(upload.applied).toBe(false);
    expect(read.data).toEqual(new Uint8Array([7, 8, 9]));
    expect(read.source).toBe("newer-upload.fbx");
    expect(read.sourceKind).toBe("upload");
  });

  it("serializes an aggregate URL winner and rebuilds its exact bytes without refetching", async () => {
    const source = CreateAsciiFbx74TriangleFixture();
    const url = "https://cdn.example.com/models/triangle.fbx?token=serialized";
    const asset = new NodeAsset("serialized-url-fbx");
    const importer = new ImportFBXAggregateBlock("Import FBX", asset);
    await importer.setUrlAsync(url, async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => source.slice().buffer,
    }));

    const parsed = NodeAsset.Parse(
      JSON.parse(JSON.stringify(asset.serialize())),
    );
    const parsedImporter = parsed.attachedBlocks[0] as ImportFBXAggregateBlock;
    expect(parsedImporter.data).toEqual(source);
    expect(parsedImporter.source).toBe(url);
    expect(parsedImporter.sourceKind).toBe("url");

    const exporter = new ExportGLTFAggregateBlock("Export glTF", parsed);
    parsedImporter.output.connectTo(exporter.input);
    const fetchSpy = vi.fn(() => {
      throw new Error("Serialized FBX URL builds must not refetch.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const glb = await parsed.buildAsync();
      expect(await ReadStableMeshFactsAsync(glb)).toEqual({
        meshCount: 1,
        nodeNames: ["Triangle"],
        positionCount: 3,
        indexCount: 3,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }

    parsedImporter.clearSource();
    expect(parsedImporter.data).toBeNull();
    expect(parsedImporter.source).toBeNull();
    expect(parsedImporter.sourceKind).toBeNull();
  });

  it("builds an uploaded ASCII FBX through saved aggregate and primitive funnels without fetching", async () => {
    const source = CreateAsciiFbx74TriangleFixture();

    const serializedAsset = new NodeAsset("serialized-fbx-funnel");
    const serializedImporter = new ImportFBXAggregateBlock(
      "Import FBX",
      serializedAsset,
    );
    serializedImporter.setUploadedSource(source, "triangle.fbx");
    const serialization = JSON.parse(
      JSON.stringify(serializedAsset.serialize()),
    );
    expect(serialization.blocks[0]).toMatchObject({
      customType: ImportFBXAggregateBlock.ClassName,
      aggregateVersion: 1,
      subgraph: {
        blocks: [
          {
            customType: ReadFBXBlock.ClassName,
            source: "triangle.fbx",
            sourceKind: "upload",
          },
          { customType: FBXToUniversalBlock.ClassName },
        ],
      },
    });

    const aggregateAsset = NodeAsset.Parse(serialization);
    const aggregateImporter = aggregateAsset
      .attachedBlocks[0] as ImportFBXAggregateBlock;
    const aggregateCapture = new CaptureUniversalManifestBlock(
      "Capture aggregate manifest",
      aggregateAsset,
    );
    const aggregateExport = new ExportGLTFAggregateBlock(
      "Export aggregate glTF",
      aggregateAsset,
    );
    aggregateImporter.output.connectTo(aggregateCapture.input);
    aggregateCapture.output.connectTo(aggregateExport.input);

    const primitiveAsset = new NodeAsset("primitive-fbx-funnel");
    const read = new ReadFBXBlock("Read FBX", primitiveAsset);
    read.setUploadedSource(source, "triangle.fbx");
    const toUniversal = new FBXToUniversalBlock(
      "FBX \u2192 Universal",
      primitiveAsset,
    );
    const primitiveCapture = new CaptureUniversalManifestBlock(
      "Capture primitive manifest",
      primitiveAsset,
    );
    const primitiveExport = new ExportGLTFAggregateBlock(
      "Export primitive glTF",
      primitiveAsset,
    );
    read.output.connectTo(toUniversal.input);
    toUniversal.output.connectTo(primitiveCapture.input);
    primitiveCapture.output.connectTo(primitiveExport.input);

    const fetchSpy = vi.fn(() => {
      throw new Error("Uploaded FBX builds must not fetch.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const aggregateGlb = await aggregateAsset.buildAsync();
      const primitiveGlb = await primitiveAsset.buildAsync();
      const expectedFacts = {
        meshCount: 1,
        nodeNames: ["Triangle"],
        positionCount: 3,
        indexCount: 3,
      };

      expect(aggregateGlb.subarray(0, 4)).toEqual(
        new TextEncoder().encode("glTF"),
      );
      expect(aggregateGlb.byteLength).toBeGreaterThan(20);
      expect(await ReadStableMeshFactsAsync(aggregateGlb)).toEqual(
        expectedFacts,
      );
      expect(await ReadStableMeshFactsAsync(primitiveGlb)).toEqual(
        expectedFacts,
      );
      expect(aggregateCapture.manifest).toEqual({
        format: "universal",
        importedFrom: "fbx",
        source: "triangle.fbx",
      });
      expect(primitiveCapture.manifest).toEqual(aggregateCapture.manifest);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { label: "FBX 7.4 with 32-bit node headers", create: CreateBinaryFbx74TriangleFixture },
    { label: "FBX 7.5 with 64-bit node headers", create: CreateBinaryFbx75TriangleFixture },
  ])("builds representative binary $label through the full graph funnel", async ({ create }) => {
    const glb = await CreateExportingAsset(create()).buildAsync();

    expect(await ReadStableMeshFactsAsync(glb)).toEqual({
      meshCount: 1,
      nodeNames: ["Triangle"],
      positionCount: 3,
      indexCount: 3,
    });
  });

  it.each([
    { version: 6800, create: CreateBinaryFbx74TriangleFixture },
    { version: 7800, create: CreateBinaryFbx75TriangleFixture },
  ])("rejects unsupported binary FBX version $version with source context and cause", async ({ version, create }) => {
    const bytes = create().slice();
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(23, version, true);

    const error = await CreateExportingAsset(bytes)
      .buildAsync()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/failed to convert "triangle\.fbx" to Universal/);
    expect((error as Error).cause).toMatchObject({
      message: expect.stringMatching(new RegExp("unsupported FBX version " + version + ".*7\\.0.*7\\.7", "i")),
    });
  });

  it("accounts uploaded bytes and rejects a missing source before parsing", async () => {
    await expect(CreateExportingAsset().buildAsync()).rejects.toThrow(
      /Set an FBX URL or upload a \.fbx file before building/,
    );

    const source = CreateAsciiFbx74TriangleFixture();
    await expect(
      CreateExportingAsset(source).buildAsync({
        limits: { maxSourceAssetBytes: source.byteLength - 1 },
      }),
    ).rejects.toMatchObject({
      code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
      actual: source.byteLength,
    });
  });

  it.each([
    {
      label: "recognized malformed ASCII",
      create: () => new TextEncoder().encode("; FBX 7.4.0 project file\nObjects: {"),
      cause: /expected token|unexpected|end of input/i,
    },
    {
      label: "recognized malformed binary",
      create: () => CreateBinaryFbx74TriangleFixture().subarray(0, 30),
      cause: /node header|unexpected end|truncated/i,
    },
    {
      label: "unrecognized bytes",
      create: () => new TextEncoder().encode("not an FBX document"),
      cause: /unrecognized FBX format/i,
    },
  ])("rejects $label with source context and retained parser cause", async ({ create, cause }) => {
    const error = await CreateExportingAsset(create())
      .buildAsync()
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/failed to convert "triangle\.fbx" to Universal/);
    expect((error as Error).cause).toMatchObject({ message: expect.stringMatching(cause) });
  });

  it("disposes FBX resources on success plus loader, export, and readback failure", async () => {
    const containerDispose = vi.spyOn(AssetContainer.prototype, "dispose");
    const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
    const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
    try {
      await expect(
        CreateExportingAsset(CreateAsciiFbx74TriangleFixture()).buildAsync(),
      ).resolves.toBeInstanceOf(Uint8Array);
      expect(containerDispose).toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();

      containerDispose.mockClear();
      sceneDispose.mockClear();
      engineDispose.mockClear();
      const exportFailure = new Error("forced FBX export failure");
      vi.spyOn(GLTF2Export, "GLBAsync").mockRejectedValueOnce(exportFailure);

      const error = await CreateExportingAsset(
        CreateAsciiFbx74TriangleFixture(),
      )
        .buildAsync()
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBe(exportFailure);
      expect(containerDispose).toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();

      containerDispose.mockClear();
      sceneDispose.mockClear();
      engineDispose.mockClear();
      const readbackFailure = new Error("forced FBX readback failure");
      vi.spyOn(WebIO.prototype, "readBinary").mockRejectedValueOnce(readbackFailure);
      const readbackError = await CreateExportingAsset(CreateAsciiFbx74TriangleFixture())
        .buildAsync()
        .catch((reason: unknown) => reason);
      expect(readbackError).toMatchObject({ cause: readbackFailure });
      expect(containerDispose).toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();

      containerDispose.mockClear();
      sceneDispose.mockClear();
      engineDispose.mockClear();
      const loaderError = await CreateExportingAsset(new TextEncoder().encode("; FBX 7.4.0 project file\nObjects: {"))
        .buildAsync()
        .catch((reason: unknown) => reason);
      expect(loaderError).toMatchObject({ cause: expect.any(Error) });
      expect(containerDispose).not.toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("propagates canonical cancellation after export settles, cleans resources, skips readback, and rebuilds", async () => {
    const asset = CreateExportingAsset(CreateAsciiFbx74TriangleFixture());
    const originalExport = GLTF2Export.GLBAsync;
    let markExportStarted!: () => void;
    let releaseExport!: () => void;
    const exportStarted = new Promise<void>((resolve) => {
      markExportStarted = resolve;
    });
    const exportRelease = new Promise<void>((resolve) => {
      releaseExport = resolve;
    });
    vi.spyOn(GLTF2Export, "GLBAsync").mockImplementationOnce(async (...args) => {
      markExportStarted();
      await exportRelease;
      return await originalExport(...args);
    });
    const readBinary = vi.spyOn(WebIO.prototype, "readBinary");
    const containerCleanupFailure = new Error("forced cancellation cleanup failure");
    const containerDispose = vi.spyOn(AssetContainer.prototype, "dispose").mockImplementationOnce(() => {
      throw containerCleanupFailure;
    });
    const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
    const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
    const controller = new AbortController();

    let cancellation: unknown;
    try {
      const build = asset.buildAsync({ signal: controller.signal });
      await exportStarted;
      controller.abort("cancelled during FBX export");
      releaseExport();
      cancellation = await build.catch((reason: unknown) => reason);

      expect(cancellation).toBeInstanceOf(BuildCancelledError);
      expect((cancellation as BuildCancelledError).reason).toBe("cancelled during FBX export");
      expect(readBinary).not.toHaveBeenCalled();
      expect(containerDispose).toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();
      expect(GetNodeAssetBuildReport(cancellation)?.diagnostics).toContainEqual(
        expect.objectContaining({ code: "NODE_ASSET_FBX_CLEANUP_FAILED", message: containerCleanupFailure.message }),
      );
    } finally {
      releaseExport();
      vi.restoreAllMocks();
    }

    await expect(asset.buildAsync()).resolves.toBeInstanceOf(Uint8Array);
  });

  it("rejects unknown source kinds during strict graph parsing", () => {
    const asset = new NodeAsset("strict-fbx-state");
    const importer = new ImportFBXAggregateBlock("Import FBX", asset);
    importer.setUploadedSource(
      CreateAsciiFbx74TriangleFixture(),
      "triangle.fbx",
    );
    const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
      blocks: Array<{ subgraph: { blocks: Array<{ sourceKind?: string }> } }>;
    };
    serialization.blocks[0].subgraph.blocks[0].sourceKind = "snippet";

    expect(() => NodeAsset.Parse(serialization)).toThrow(
      'Invalid serialized block property "sourceKind"',
    );
  });

  it("round-trips empty uploaded bytes without producing a partial active source", () => {
    const asset = new NodeAsset("empty-fbx-source");
    const read = new ReadFBXBlock("Read FBX", asset);
    read.setUploadedSource(new Uint8Array(), "empty.fbx");

    const parsed = NodeAsset.Parse(
      JSON.parse(JSON.stringify(asset.serialize())),
    );
    const parsedRead = parsed.attachedBlocks[0] as ReadFBXBlock;

    expect(parsedRead.data).toEqual(new Uint8Array());
    expect(parsedRead.source).toBe("empty.fbx");
    expect(parsedRead.sourceKind).toBe("upload");
  });

  it.each([
    { data: null, source: "triangle.fbx", sourceKind: "upload" },
    { data: "", source: null, sourceKind: "upload" },
    { data: "", source: "triangle.fbx", sourceKind: "" },
    { data: null, source: "", sourceKind: "" },
    {
      data: "not canonical base64",
      source: "triangle.fbx",
      sourceKind: "upload",
    },
  ])(
    "rejects partial or non-canonical serialized source state: %j",
    (sourceState) => {
      const asset = new NodeAsset("invalid-fbx-state");
      const read = new ReadFBXBlock("Read FBX", asset);
      const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
        blocks: Array<{
          data: string | null;
          source: string | null;
          sourceKind: string;
        }>;
      };
      Object.assign(serialization.blocks[0], sourceState);

      expect(() => NodeAsset.Parse(serialization)).toThrow(
        /Invalid serialized FBX source state/,
      );
    },
  );

  it("preserves the conversion failure when every cleanup step also fails", async () => {
    const exportFailure = new Error("forced conversion failure");
    const containerCleanupFailure = new Error(
      "forced container cleanup failure",
    );
    const sceneCleanupFailure = new Error("forced scene cleanup failure");
    const engineCleanupFailure = new Error("forced engine cleanup failure");
    const containerDispose = vi
      .spyOn(AssetContainer.prototype, "dispose")
      .mockImplementationOnce(() => {
        throw containerCleanupFailure;
      });
    const sceneDispose = vi
      .spyOn(Scene.prototype, "dispose")
      .mockImplementationOnce(() => {
        throw sceneCleanupFailure;
      });
    const engineDispose = vi
      .spyOn(NullEngine.prototype, "dispose")
      .mockImplementationOnce(() => {
        throw engineCleanupFailure;
      });
    vi.spyOn(GLTF2Export, "GLBAsync").mockRejectedValueOnce(exportFailure);

    try {
      const error = await CreateExportingAsset(
        CreateAsciiFbx74TriangleFixture(),
      )
        .buildAsync()
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).message).toMatch(
        /failed to convert "triangle\.fbx" to Universal/,
      );
      expect((error as AggregateError).cause).toMatchObject({
        cause: exportFailure,
      });
      expect((error as AggregateError).errors).toEqual([
        expect.objectContaining({ cause: exportFailure }),
        containerCleanupFailure,
        sceneCleanupFailure,
        engineCleanupFailure,
      ]);
      expect(containerDispose).toHaveBeenCalled();
      expect(sceneDispose).toHaveBeenCalled();
      expect(engineDispose).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
