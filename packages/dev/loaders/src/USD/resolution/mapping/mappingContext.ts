import { type ISdfLayer, type ISdfPrimSpec } from "../sdf/index";
import { type IResolvedDiagnostic, type IResolvedMaterial, type IResolvedMesh } from "../resolvedStage";
import { type IUsdAssetSource } from "../layerSource";

/** Shared state used while mapping one validated single Sdf layer into a resolved stage. */
export interface IStageMappingContext {
    /** Source layer being mapped. */
    layer: ISdfLayer;
    /** Optional source-owned resolver for archive-local asset paths. */
    assetSource?: IUsdAssetSource;
    /** Absolute prim-path lookup for relationship and shader-network resolution. */
    primByPath: ReadonlyMap<string, ISdfPrimSpec>;
    /** Shared mesh pool owned by the resolved stage under construction. */
    meshes: IResolvedMesh[];
    /** Shared material pool owned by the resolved stage under construction. */
    materials: IResolvedMaterial[];
    /** Mesh pool lookup by deterministic geometry key. */
    meshIndexByKey: Map<string, number>;
    /** Material pool lookup by Material prim path (or by path + fallback-color key when the
     * path resolves to a fallback material, since the fallback color affects appearance and two
     * meshes with different fallback colors must not share a pooled fallback material). */
    materialIndexByPath: Map<string, number>;
    /** Per-Material-prim-path cache of the resolved UsdPreviewSurface shader prim (or `null` when
     * none is found). Computed once per path even though every bound mesh consults it, since
     * resolving the shader connection graph reports diagnostics as a side effect; re-resolving it
     * per mesh would duplicate those diagnostics. */
    materialSurfaceShaderByPath: Map<string, ISdfPrimSpec | null>;
    /** Non-fatal diagnostics collected during mapping. */
    diagnostics: IResolvedDiagnostic[];
    /** Set once the stage-wide unauthored-default subdivision advisory has been emitted, so it is reported only once per stage. */
    emittedUnauthoredSubdivisionDiagnostic?: boolean;
}
