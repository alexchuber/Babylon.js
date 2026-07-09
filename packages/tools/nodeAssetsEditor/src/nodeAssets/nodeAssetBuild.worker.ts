import { SerializeNodeAssetBuildError, type INodeAssetBuildRequest, type NodeAssetBuildResponse } from "./nodeAssetBuildMessages";
import { BuildSerializedNodeAssetAsync } from "./nodeAssetBuildWorkerCore";
import { NodeAssetBuildWorkerResourceUrls } from "./nodeAssetBuildWorkerResources";

interface IBuildWorkerScope {
    addEventListener(type: "message", listener: (event: MessageEvent<INodeAssetBuildRequest>) => void): void;
    postMessage(response: NodeAssetBuildResponse, transfer?: Transferable[]): void;
}

interface IWorkerGlobalWithBrowserMarker {
    window?: IWorkerGlobalWithBrowserMarker;
}

const WorkerGlobal = globalThis as unknown as IWorkerGlobalWithBrowserMarker;
// ktx2-encoder chooses its browser/OffscreenCanvas path with `typeof window`, which is false in workers.
WorkerGlobal.window ??= WorkerGlobal;

function CopyToTransferableBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function PostResponse(workerScope: IBuildWorkerScope, response: NodeAssetBuildResponse, transfer: Transferable[] = []): void {
    workerScope.postMessage(response, transfer);
}

async function HandleBuildRequestAsync(workerScope: IBuildWorkerScope, request: INodeAssetBuildRequest): Promise<void> {
    try {
        const bytes = await BuildSerializedNodeAssetAsync(request.graph, NodeAssetBuildWorkerResourceUrls);
        const buffer = CopyToTransferableBuffer(bytes);
        PostResponse(workerScope, { type: "success", generation: request.generation, bytes: buffer }, [buffer]);
    } catch (error) {
        PostResponse(workerScope, { type: "error", generation: request.generation, error: SerializeNodeAssetBuildError(error) });
    }
}

const WorkerScope = self as unknown as IBuildWorkerScope;
WorkerScope.addEventListener("message", (event: MessageEvent<INodeAssetBuildRequest>) => {
    void HandleBuildRequestAsync(WorkerScope, event.data);
});
