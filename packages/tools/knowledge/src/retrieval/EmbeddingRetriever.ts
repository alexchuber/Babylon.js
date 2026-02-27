/* eslint-disable no-console */
import type { IKnowledgeChunk, ISearchQuery, ISearchResult, IRetriever, IEmbeddingProvider, IEmbeddingIndex } from "../types.js";

/**
 * Compute the cosine similarity between two vectors of equal length.
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity in [-1, 1], clamped to [0, 1] for our use case.
 */
function CosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    if (denom === 0) {
        return 0;
    }
    // Clamp to [0, 1] — negative similarity means unrelated
    return Math.max(0, dot / denom);
}

/**
 * Semantic retriever that uses pre-computed embeddings for chunk similarity
 * search. At query time, it embeds the query text via an IEmbeddingProvider
 * and computes cosine similarity against all indexed chunk vectors.
 *
 * This is a brute-force linear scan — fine for corpora up to ~100K chunks.
 * For larger corpora, swap in an ANN index (HNSW, IVF, etc.).
 */
export class EmbeddingRetriever implements IRetriever {
    private _provider: IEmbeddingProvider;
    private _chunkMap: Map<string, IKnowledgeChunk> = new Map();
    private _vectors: Map<string, number[]> = new Map();

    /**
     * @param provider - Embedding provider for query-time embedding.
     */
    constructor(provider: IEmbeddingProvider) {
        this._provider = provider;
    }

    /**
     * Index chunks using their pre-computed embeddings.
     * If no pre-computed embeddings are available, this computes them on the fly
     * via the embedding provider (expensive — prefer pre-computing at ingestion).
     *
     * @param chunks - The chunks to index.
     * @param precomputed - Optional pre-computed embedding index.
     */
    public async indexAsync(chunks: IKnowledgeChunk[], precomputed?: IEmbeddingIndex): Promise<void> {
        this._chunkMap.clear();
        this._vectors.clear();

        for (const chunk of chunks) {
            this._chunkMap.set(chunk.id, chunk);
        }

        if (precomputed) {
            // Use pre-computed embeddings
            let loaded = 0;
            for (const chunk of chunks) {
                const vec = precomputed.vectors[chunk.id];
                if (vec) {
                    this._vectors.set(chunk.id, vec);
                    loaded++;
                }
            }
            console.log(`[EmbeddingRetriever] Loaded ${loaded}/${chunks.length} pre-computed embeddings.`);

            // Compute any missing embeddings
            const missing = chunks.filter((c) => !this._vectors.has(c.id));
            if (missing.length > 0) {
                console.log(`[EmbeddingRetriever] Computing ${missing.length} missing embeddings...`);
                await this._computeAndStoreAsync(missing);
            }
        } else {
            // Compute all embeddings from scratch
            console.log(`[EmbeddingRetriever] Computing embeddings for ${chunks.length} chunks...`);
            await this._computeAndStoreAsync(chunks);
        }

        console.log(`[EmbeddingRetriever] Indexed ${this._vectors.size} chunk embeddings (${this._provider.dimensions}d).`);
    }

    /**
     * Retrieve chunks by semantic similarity to the query.
     * @param query - The search query.
     * @returns Scored results sorted by similarity, descending.
     */
    public async retrieveAsync(query: ISearchQuery): Promise<ISearchResult[]> {
        // Embed the query
        const [queryVec] = await this._provider.embedAsync([query.text]);

        // Score all chunks
        const scored: { id: string; similarity: number }[] = [];
        for (const [id, vec] of this._vectors) {
            const similarity = CosineSimilarity(queryVec, vec);
            scored.push({ id, similarity });
        }

        // Sort by similarity descending
        scored.sort((a, b) => b.similarity - a.similarity);

        // Convert to results
        const results: ISearchResult[] = [];
        for (const entry of scored) {
            const chunk = this._chunkMap.get(entry.id);
            if (!chunk) {
                continue;
            }

            // Apply minScore filter
            if (query.minScore !== undefined && entry.similarity < query.minScore) {
                continue;
            }

            results.push({
                chunk,
                score: Math.round(entry.similarity * 100) / 100,
                matchReason: `Semantic similarity: ${entry.similarity.toFixed(2)}`,
            });
        }

        return results;
    }

    /**
     * Compute embeddings for a batch of chunks and store them.
     * @param chunks - Chunks to embed.
     */
    private async _computeAndStoreAsync(chunks: IKnowledgeChunk[]): Promise<void> {
        // Build text for embedding: combine title + content + signature for richer representation
        const texts = chunks.map((c) => {
            const parts = [c.metadata.title, c.content];
            if (c.metadata.apiSignature) {
                parts.push(c.metadata.apiSignature);
            }
            if (c.metadata.parentContext) {
                parts.push(c.metadata.parentContext);
            }
            return parts.join(" | ");
        });

        // Batch embed (provider handles batching internally if needed)
        const vectors = await this._provider.embedAsync(texts);

        for (let i = 0; i < chunks.length; i++) {
            this._vectors.set(chunks[i].id, vectors[i]);
        }
    }

    /**
     * Export the current embedding index (for serialization into corpus).
     * @returns The embedding index.
     */
    public async exportIndexAsync(): Promise<IEmbeddingIndex> {
        const vectors: Record<string, number[]> = {};
        for (const [id, vec] of this._vectors) {
            vectors[id] = vec;
        }
        return {
            model: this._provider.model,
            dimensions: this._provider.dimensions,
            vectors,
        };
    }
}
