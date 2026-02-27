import type { IKnowledgeChunk, KnowledgeType } from "../types.js";
import { IngestorBase } from "./IngestorBase.js";

/**
 * STUB: Playground ingestor.
 * Not yet implemented — will eventually parse Babylon.js Playground snippets.
 */
export class PlaygroundIngestor extends IngestorBase {
    /** {@inheritDoc} */
    public readonly sourceType: KnowledgeType = "example";

    /**
     * Ingest playground data (stub).
     * @returns Empty array — not yet implemented.
     */
    public async ingestAsync(): Promise<IKnowledgeChunk[]> {
        this._warn("Not yet implemented — returning no results.");
        return [];
    }
}
