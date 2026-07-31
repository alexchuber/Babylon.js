import {
    type IResolvedAnimation,
    type IResolvedAnimationTrack,
    type IResolvedDiagnostic,
    type IStageMetadata,
    type ResolvedInterpolation,
    type Mat4,
    type Quat,
    type Vec3,
} from "../resolvedStage";
import { type ISdfAttributeSpec, type ISdfLayer, type ISdfPrimSpec, type SdfValue } from "../sdf/index";
import { AsMat4, AsQuat, AsToken, AsVec3, GetAttribute, GetMetadataToken, GetTokenArrayAttribute } from "./valueAccess";
import { DecomposeMatrix, MatchesXformOpFamily, ResolveTransform, UsdMatrixToResolvedLayout } from "./transformMapping";

/**
 * Bakes supported prim time samples into resolved animation tracks.
 * @param prim prim whose attributes should be scanned
 * @param layer source layer for interpolation metadata
 * @param metadata resolved stage metadata for time conversion
 * @param diagnostics diagnostics sink for deferred animation features
 * @returns resolved animation, or undefined when the prim has no supported tracks
 */
export function ResolvePrimAnimation(prim: ISdfPrimSpec, layer: ISdfLayer, metadata: IStageMetadata, diagnostics: IResolvedDiagnostic[]): IResolvedAnimation | undefined {
    const interpolation = ResolveStageInterpolation(layer);
    const tracks: IResolvedAnimationTrack[] = [];
    const orderedXformOrder = GetTokenArrayAttribute(prim, "xformOpOrder");
    const orderedXformTracks = BuildOrderedTransformTracks(prim, orderedXformOrder, metadata.timeCodesPerSecond, interpolation, diagnostics);
    if (orderedXformTracks) {
        tracks.push(...orderedXformTracks);
    }

    for (const [name, property] of Object.entries(prim.properties)) {
        if (property.kind !== "attribute" || !property.timeSamples || property.timeSamples.times.length === 0) {
            continue;
        }
        if (name === "visibility") {
            tracks.push(BuildVisibilityTrack(property, metadata.timeCodesPerSecond));
        } else if (orderedXformOrder !== undefined && name.startsWith("xformOp:")) {
            continue;
        } else if (MatchesXformOpFamily(name, "xformOp:translate")) {
            tracks.push(BuildVec3Track("translation", property, metadata.timeCodesPerSecond, interpolation));
        } else if (MatchesXformOpFamily(name, "xformOp:scale")) {
            tracks.push(BuildVec3Track("scale", property, metadata.timeCodesPerSecond, interpolation));
        } else if (/^xformOp:orient(?::.*)?$/.test(name)) {
            tracks.push(BuildQuatTrack(property, metadata.timeCodesPerSecond, interpolation));
        } else if (IsAnimationRotationOp(name)) {
            tracks.push(BuildRotationTrack(name, property, metadata.timeCodesPerSecond, interpolation));
        } else if (MatchesXformOpFamily(name, "xformOp:transform")) {
            tracks.push(...BuildMatrixTracks(property, metadata.timeCodesPerSecond, interpolation, diagnostics, property.path ?? prim.path));
        } else if (name.startsWith("xformOp:")) {
            diagnostics.push({ severity: "info", path: property.path ?? prim.path, message: `Animation for '${name}' is deferred.` });
        }
    }

    return tracks.length > 0 ? { tracks } : undefined;
}

function BuildOrderedTransformTracks(
    prim: ISdfPrimSpec,
    order: string[] | undefined,
    timeCodesPerSecond: number,
    interpolation: ResolvedInterpolation,
    diagnostics: IResolvedDiagnostic[]
): IResolvedAnimationTrack[] | undefined {
    if (!order) {
        return undefined;
    }

    const opNames = order.map(StripInvertMarker);
    const animatedAttributes = opNames
        .map((name) => GetAttribute(prim, name))
        .filter((attribute): attribute is ISdfAttributeSpec => attribute?.timeSamples !== undefined && attribute.timeSamples.times.length > 0);
    if (animatedAttributes.length === 0) {
        return undefined;
    }

    const sampleTimes = [...new Set(animatedAttributes.flatMap((attribute) => attribute.timeSamples?.times ?? []))].sort((left, right) => left - right);
    const translations: number[] = [];
    const rotations: number[] = [];
    const scales: number[] = [];
    let reportedMatrixApproximation = false;

    for (const time of sampleTimes) {
        const sampledPrim = CreateSampledPrim(prim, opNames, time, interpolation);
        const sampleDiagnostics: IResolvedDiagnostic[] = [];
        const transform = ResolveTransform(sampledPrim, sampleDiagnostics);
        for (const diagnostic of sampleDiagnostics) {
            if (!diagnostics.some((existing) => existing.path === diagnostic.path && existing.message === diagnostic.message)) {
                diagnostics.push(diagnostic);
            }
        }
        if (transform.matrix && !reportedMatrixApproximation) {
            diagnostics.push({
                severity: "info",
                path: prim.path,
                message: "Ordered xformOp animation uses decomposed TRS tracks for a composed matrix stack; exact matrix interpolation is not preserved.",
            });
            reportedMatrixApproximation = true;
        }
        translations.push(transform.translation[0], transform.translation[1], transform.translation[2]);
        rotations.push(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
        scales.push(transform.scale[0], transform.scale[1], transform.scale[2]);
    }

    const times = new Float32Array(sampleTimes.map((time) => time / timeCodesPerSecond));
    return [
        { target: "translation", times, values: new Float32Array(translations), interpolation },
        { target: "rotation", times, values: new Float32Array(rotations), interpolation },
        { target: "scale", times, values: new Float32Array(scales), interpolation },
    ];
}

function CreateSampledPrim(prim: ISdfPrimSpec, opNames: string[], time: number, interpolation: ResolvedInterpolation): ISdfPrimSpec {
    const properties = { ...prim.properties };
    for (const opName of opNames) {
        const attribute = GetAttribute(prim, opName);
        if (!attribute) {
            continue;
        }
        const value = EvaluateAttributeAtTime(attribute, time, interpolation);
        if (value) {
            properties[opName] = { ...attribute, default: value, timeSamples: undefined };
        }
    }
    return { ...prim, properties };
}

function EvaluateAttributeAtTime(attribute: ISdfAttributeSpec, time: number, interpolation: ResolvedInterpolation): SdfValue | undefined {
    const samples = attribute.timeSamples;
    if (!samples || samples.times.length === 0) {
        return attribute.default;
    }

    let previousIndex = -1;
    let nextIndex = -1;
    for (let index = 0; index < samples.times.length; index++) {
        const sampleTime = samples.times[index];
        if (sampleTime <= time) {
            previousIndex = index;
        }
        if (sampleTime >= time) {
            nextIndex = index;
            break;
        }
    }

    if (previousIndex === nextIndex || interpolation === "held" || previousIndex < 0 || nextIndex < 0) {
        const index = previousIndex >= 0 ? previousIndex : nextIndex;
        return index >= 0 ? samples.values[index] : attribute.default;
    }

    const previousTime = samples.times[previousIndex];
    const nextTime = samples.times[nextIndex];
    const factor = nextTime === previousTime ? 0 : (time - previousTime) / (nextTime - previousTime);
    return InterpolateSdfValue(samples.values[previousIndex], samples.values[nextIndex], factor);
}

function InterpolateSdfValue(left: SdfValue, right: SdfValue, factor: number): SdfValue {
    if (typeof left.value === "number" && typeof right.value === "number") {
        return { type: left.type, value: left.value + (right.value - left.value) * factor } as SdfValue;
    }
    if (
        Array.isArray(left.value) &&
        Array.isArray(right.value) &&
        left.value.length === right.value.length &&
        left.value.every((value) => typeof value === "number") &&
        right.value.every((value) => typeof value === "number")
    ) {
        const leftValues = left.value as number[];
        const rightValues = right.value as number[];
        return {
            type: left.type,
            value: leftValues.map((value, index) => value + (rightValues[index] - value) * factor),
        } as SdfValue;
    }
    return left;
}

function StripInvertMarker(opName: string): string {
    return opName.startsWith("!invert!") ? opName.slice("!invert!".length) : opName;
}

function IsAnimationRotationOp(name: string): boolean {
    return /^xformOp:rotate(?:X|Y|Z|[XYZ]{3})(?::.*)?$/.test(name);
}

// USD resolves time samples of linearly-interpolatable value types (floats and their vector/quaternion/matrix
// forms, as used by every animated xformOp here) with linear interpolation by default; only an explicit stage
// `interpolation = "held"` opinion forces held stepping across the whole stage. Non-interpolatable types such
// as the visibility token are always held regardless of this value and are handled by their own track builder.
function ResolveStageInterpolation(layer: ISdfLayer): ResolvedInterpolation {
    return GetMetadataToken(layer.metadata, "interpolation") === "held" ? "held" : "linear";
}

function BuildVec3Track(target: "translation" | "scale", attribute: ISdfAttributeSpec, timeCodesPerSecond: number, interpolation: ResolvedInterpolation): IResolvedAnimationTrack {
    const values: number[] = [];
    for (const sample of attribute.timeSamples?.values ?? []) {
        const vector = AsVec3(sample) ?? [0, 0, 0];
        values.push(vector[0], vector[1], vector[2]);
    }
    return {
        target,
        times: BuildTimes(attribute, timeCodesPerSecond),
        values: new Float32Array(values),
        interpolation,
    };
}

function BuildQuatTrack(attribute: ISdfAttributeSpec, timeCodesPerSecond: number, interpolation: ResolvedInterpolation): IResolvedAnimationTrack {
    const values: number[] = [];
    for (const sample of attribute.timeSamples?.values ?? []) {
        const quat = AsQuat(sample) ?? [0, 0, 0, 1];
        values.push(quat[0], quat[1], quat[2], quat[3]);
    }
    return {
        target: "rotation",
        times: BuildTimes(attribute, timeCodesPerSecond),
        values: new Float32Array(values),
        interpolation,
    };
}

function BuildRotationTrack(name: string, attribute: ISdfAttributeSpec, timeCodesPerSecond: number, interpolation: ResolvedInterpolation): IResolvedAnimationTrack {
    const values: number[] = [];
    for (const sample of attribute.timeSamples?.values ?? []) {
        const quat = ResolveRotationSample(name, sample);
        values.push(quat[0], quat[1], quat[2], quat[3]);
    }
    return {
        target: "rotation",
        times: BuildTimes(attribute, timeCodesPerSecond),
        values: new Float32Array(values),
        interpolation,
    };
}

function BuildVisibilityTrack(attribute: ISdfAttributeSpec, timeCodesPerSecond: number): IResolvedAnimationTrack {
    const values = (attribute.timeSamples?.values ?? []).map((sample) => (AsToken(sample) === "invisible" ? 0 : 1));
    return {
        target: "visibility",
        times: BuildTimes(attribute, timeCodesPerSecond),
        values: new Float32Array(values),
        // USD visibility is a non-interpolatable token, so it always steps (held) between samples
        // regardless of the layer's default interpolation.
        interpolation: "held",
    };
}

function BuildMatrixTracks(
    attribute: ISdfAttributeSpec,
    timeCodesPerSecond: number,
    interpolation: ResolvedInterpolation,
    diagnostics: IResolvedDiagnostic[],
    path: string
): IResolvedAnimationTrack[] {
    // Babylon animates nodes through TRS channels, so a matrix-valued xformOp is decomposed per sample
    // and its translation/rotation/scale interpolated independently. This is an approximation of USD's
    // element-wise matrix interpolation, so record it as an honest, non-fatal diagnostic.
    diagnostics.push({
        severity: "info",
        path,
        message:
            "Matrix-valued animation (xformOp:transform) is approximated by decomposing each sample into interpolated translation, rotation, and scale; USD element-wise matrix interpolation is not preserved.",
    });
    const translations: number[] = [];
    const rotations: number[] = [];
    const scales: number[] = [];
    for (const sample of attribute.timeSamples?.values ?? []) {
        const matrix = AsMat4(sample);
        const transform = matrix
            ? DecomposeMatrix(UsdMatrixToResolvedLayout(matrix as Mat4))
            : { translation: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as Quat, scale: [1, 1, 1] as Vec3 };
        translations.push(transform.translation[0], transform.translation[1], transform.translation[2]);
        rotations.push(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
        scales.push(transform.scale[0], transform.scale[1], transform.scale[2]);
    }
    const times = BuildTimes(attribute, timeCodesPerSecond);
    return [
        { target: "translation", times, values: new Float32Array(translations), interpolation },
        { target: "rotation", times, values: new Float32Array(rotations), interpolation },
        { target: "scale", times, values: new Float32Array(scales), interpolation },
    ];
}

function BuildTimes(attribute: ISdfAttributeSpec, timeCodesPerSecond: number): Float32Array {
    return new Float32Array((attribute.timeSamples?.times ?? []).map((time) => time / timeCodesPerSecond));
}

function ResolveRotationSample(name: string, sample: SdfValue): Quat {
    const eulerOrder = name.match(/^xformOp:rotate([XYZ]{3})(?::.*)?$/)?.[1];
    if (eulerOrder) {
        return QuaternionFromEulerOrder(AsVec3(sample) ?? [0, 0, 0], eulerOrder);
    }
    const degrees = typeof sample.value === "number" ? sample.value : 0;
    if (name.startsWith("xformOp:rotateX")) {
        return QuaternionFromAxisAngle([1, 0, 0], degrees);
    }
    if (name.startsWith("xformOp:rotateY")) {
        return QuaternionFromAxisAngle([0, 1, 0], degrees);
    }
    return QuaternionFromAxisAngle([0, 0, 1], degrees);
}

function QuaternionFromEulerOrder(degrees: Vec3, order: string): Quat {
    const axisQuaternions: Record<string, Quat> = {
        X: QuaternionFromAxisAngle([1, 0, 0], degrees[0]),
        Y: QuaternionFromAxisAngle([0, 1, 0], degrees[1]),
        Z: QuaternionFromAxisAngle([0, 0, 1], degrees[2]),
    };
    let result: Quat = [0, 0, 0, 1];
    for (const axis of order) {
        result = MultiplyQuaternions(result, axisQuaternions[axis]);
    }
    return result;
}

function QuaternionFromAxisAngle(axis: Vec3, degrees: number): Quat {
    const halfAngle = (degrees * Math.PI) / 360;
    const s = Math.sin(halfAngle);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(halfAngle)];
}

function MultiplyQuaternions(left: Quat, right: Quat): Quat {
    return [
        left[3] * right[0] + left[0] * right[3] + left[1] * right[2] - left[2] * right[1],
        left[3] * right[1] - left[0] * right[2] + left[1] * right[3] + left[2] * right[0],
        left[3] * right[2] + left[0] * right[1] - left[1] * right[0] + left[2] * right[3],
        left[3] * right[3] - left[0] * right[0] - left[1] * right[1] - left[2] * right[2],
    ];
}
