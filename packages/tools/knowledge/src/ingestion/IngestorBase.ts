import type { IIngestor, IKnowledgeChunk, KnowledgeType } from "../types.js";

/**
 * Abstract base class for all ingestors.
 * Provides common logging and lifecycle hooks.
 */
export abstract class IngestorBase implements IIngestor {
    /** {@inheritDoc} */
    public abstract readonly sourceType: KnowledgeType;

    protected _log(message: string): void {
        // eslint-disable-next-line no-console
        console.log(`[${this.constructor.name}] ${message}`);
    }

    protected _warn(message: string): void {
        // eslint-disable-next-line no-console
        console.warn(`[${this.constructor.name}] ${message}`);
    }

    /** {@inheritDoc} */
    public abstract ingestAsync(): Promise<IKnowledgeChunk[]>;
}
