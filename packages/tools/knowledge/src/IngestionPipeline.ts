/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import type { IIngestor, IKnowledgeChunk, IEmbeddingProvider, IEmbeddingIndex } from "./types.js";

/**
 * Describes an ingestion run's metadata, stored alongside the corpus.
 */
export interface ICorpusManifest {
    /** ISO timestamp of when ingestion completed. */
    ingestedAt: string;
    /** Total number of chunks in the corpus. */
    chunkCount: number;
    /** Per-ingestor breakdown. */
    sources: { name: string; type: string; chunkCount: number }[];
}

/**
 * The on-disk corpus format: manifest + chunks + optional embeddings.
 */
export interface ICorpusFile {
    /** Metadata about the ingestion run. */
    manifest: ICorpusManifest;
    /** The knowledge chunks. */
    chunks: IKnowledgeChunk[];
    /** Pre-computed embedding vectors, keyed by chunk ID. */
    embeddings?: IEmbeddingIndex;
}

/**
 * Configuration for the IngestionPipeline.
 */
export interface IIngestionPipelineConfig {
    /** Ingestors to run. */
    ingestors: IIngestor[];
    /** Directory where the corpus file will be written. Defaults to `.corpus/`. */
    outputDir?: string;
    /** Filename for the corpus. Defaults to `corpus.json`. */
    outputFilename?: string;
    /** Optional embedding provider. If set, embeddings are computed and stored in the corpus. */
    embeddingProvider?: IEmbeddingProvider;
}

/**
 * Batch pipeline that runs ingestors and writes the resulting chunk corpus
 * to disk as JSON. This is designed to run on a schedule (e.g. daily CI job),
 * not at query time.
 *
 * Usage:
 * ```ts
 * const pipeline = new IngestionPipeline({
 *     ingestors: [new MarkdownIngestor(), new TypedocIngestor()],
 * });
 * const corpusPath = await pipeline.runAsync();
 * // corpus.json is now on disk — KnowledgeSystem loads it at query time.
 * ```
 */
export class IngestionPipeline {
    private _ingestors: IIngestor[];
    private _outputDir: string;
    private _outputFilename: string;
    private _embeddingProvider?: IEmbeddingProvider;

    /** @param config - Pipeline configuration. */
    constructor(config: IIngestionPipelineConfig) {
        this._ingestors = config.ingestors;
        this._outputDir = config.outputDir || "assets";
        this._outputFilename = config.outputFilename || "corpus.json";
        this._embeddingProvider = config.embeddingProvider;
    }

    /**
     * Run all ingestors and write the corpus to disk.
     * @returns The absolute path to the written corpus file.
     */
    public async runAsync(): Promise<string> {
        console.log("[IngestionPipeline] Starting ingestion...");

        const allChunks: IKnowledgeChunk[] = [];
        const sources: ICorpusManifest["sources"] = [];

        const ingestResults = await Promise.all(
            this._ingestors.map(async (ingestor) => {
                const name = ingestor.constructor.name;
                console.log(`[IngestionPipeline] Running ${name} (${ingestor.sourceType})...`);
                const chunks = await ingestor.ingestAsync();
                console.log(`[IngestionPipeline]   → ${chunks.length} chunks ingested.`);
                return { name, type: ingestor.sourceType, chunks };
            })
        );

        for (const result of ingestResults) {
            allChunks.push(...result.chunks);
            sources.push({ name: result.name, type: result.type, chunkCount: result.chunks.length });
        }

        const manifest: ICorpusManifest = {
            ingestedAt: new Date().toISOString(),
            chunkCount: allChunks.length,
            sources,
        };

        // Compute embeddings if a provider is configured
        const embeddings = await this._computeEmbeddingsAsync(allChunks);

        const corpus: ICorpusFile = { manifest, chunks: allChunks, embeddings };

        // Write to disk
        const outputDir = path.resolve(this._outputDir);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, this._outputFilename);
        fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), "utf-8");

        console.log(`[IngestionPipeline] Wrote ${allChunks.length} chunks to ${outputPath}`);
        console.log(`[IngestionPipeline] Manifest: ${JSON.stringify(manifest, null, 2)}`);

        return outputPath;
    }

    /**
     * Run all ingestors and return chunks in memory (without writing to disk).
     * Useful for tests or when the caller manages persistence.
     * @returns The ingested chunks and manifest.
     */
    public async runInMemoryAsync(): Promise<ICorpusFile> {
        console.log("[IngestionPipeline] Starting in-memory ingestion...");

        const allChunks: IKnowledgeChunk[] = [];
        const sources: ICorpusManifest["sources"] = [];

        const ingestResults = await Promise.all(
            this._ingestors.map(async (ingestor) => {
                const name = ingestor.constructor.name;
                console.log(`[IngestionPipeline] Running ${name} (${ingestor.sourceType})...`);
                const chunks = await ingestor.ingestAsync();
                console.log(`[IngestionPipeline]   → ${chunks.length} chunks ingested.`);
                return { name, type: ingestor.sourceType, chunks };
            })
        );

        for (const result of ingestResults) {
            allChunks.push(...result.chunks);
            sources.push({ name: result.name, type: result.type, chunkCount: result.chunks.length });
        }

        const manifest: ICorpusManifest = {
            ingestedAt: new Date().toISOString(),
            chunkCount: allChunks.length,
            sources,
        };

        // Compute embeddings if a provider is configured
        const embeddings = await this._computeEmbeddingsAsync(allChunks);

        console.log(`[IngestionPipeline] Ingested ${allChunks.length} chunks in memory.`);

        return { manifest, chunks: allChunks, embeddings };
    }

    /**
     * Compute embeddings for all chunks if a provider is configured.
     * @param chunks - The chunks to embed.
     * @returns Embedding index, or undefined if no provider.
     */
    private async _computeEmbeddingsAsync(chunks: IKnowledgeChunk[]): Promise<IEmbeddingIndex | undefined> {
        if (!this._embeddingProvider || chunks.length === 0) {
            return undefined;
        }

        console.log(`[IngestionPipeline] Computing embeddings (${this._embeddingProvider.model}, ${this._embeddingProvider.dimensions}d)...`);

        // Build text for each chunk
        const texts = chunks.map((c) => {
            const parts = [c.metadata.title, c.content];
            if (c.metadata.apiSignature) {
                parts.push(c.metadata.apiSignature);
            }
            return parts.join(" | ");
        });

        const vectors = await this._embeddingProvider.embedAsync(texts);

        const vectorMap: Record<string, number[]> = {};
        for (let i = 0; i < chunks.length; i++) {
            vectorMap[chunks[i].id] = vectors[i];
        }

        console.log(`[IngestionPipeline] Computed ${chunks.length} embeddings.`);

        return {
            model: this._embeddingProvider.model,
            dimensions: this._embeddingProvider.dimensions,
            vectors: vectorMap,
        };
    }
}
