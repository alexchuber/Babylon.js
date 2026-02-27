import type { IKnowledgeChunk, KnowledgeType } from "../types.js";
import { IngestorBase } from "./IngestorBase.js";

/**
 * STUB: Forum ingestor.
 * Not yet implemented — will eventually index Babylon.js forum threads.
 */
export class ForumIngestor extends IngestorBase {
    /** {@inheritDoc} */
    public readonly sourceType: KnowledgeType = "forum";

    /**
     * Ingest forum data (stub).
     * @returns Empty array — not yet implemented.
     */
    public async ingestAsync(): Promise<IKnowledgeChunk[]> {
        this._warn("Not yet implemented — returning no results.");
        return [];
    }
}
