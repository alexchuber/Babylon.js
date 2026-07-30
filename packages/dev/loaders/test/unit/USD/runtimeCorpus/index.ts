import * as fs from "fs";
import { fileURLToPath } from "url";

export {
    RuntimeCorpusManifest,
    BoxAsset,
    ConeAsset,
    CylinderAsset,
    DeliveryBoxAsset,
    DialysisMachineAsset,
    ForkliftAsset,
    UR10Asset,
    ShelvesAsset,
    HospitalBedAsset,
    HospitalBedWrapperAsset,
    PlaceholderAsset,
    PlaneAsset,
    RobotArmAsset,
    RobotArmWrapperAsset,
    RoomAsset,
    SeahorseTextAsset,
    SphereAsset,
    StairsAsset,
    type IRuntimeCorpusEntry,
} from "./manifest";

const runtimeCorpusRoot = new URL("../../../../../../../packages/tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url);

export function readRuntimeCorpusText(fileName: string): string {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)), "utf8");
}

export function readRuntimeCorpusBytes(fileName: string): Buffer {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)));
}

export const RUNTIME_CORPUS_CDN_ROOT = "/Assets/USD/RuntimeCorpus/";
