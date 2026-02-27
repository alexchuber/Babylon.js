import type { ISearchQuery, ISearchResult, IRanker, IKnowledgeChunk } from "../types.js";

/**
 * Simple ranker that applies:
 * 1. Date-based recency weighting (legacy chunks get 0.7x)
 * 2. Verbosity-based filtering (concise = top 3, verbose = top 10)
 * 3. For verbose mode, resolves linkIds to titles
 */
export class SimpleRanker implements IRanker {
    private _chunkMap: Map<string, IKnowledgeChunk> = new Map();

    /**
     * Provide a chunk map so the ranker can resolve linkIds to titles.
     * @param chunks - All indexed chunks.
     */
    public setChunkMap(chunks: IKnowledgeChunk[]): void {
        this._chunkMap.clear();
        for (const chunk of chunks) {
            this._chunkMap.set(chunk.id, chunk);
        }
    }

    /**
     * Rank and filter search results.
     * @param results - Raw search results.
     * @param query - The original search query.
     * @returns Ranked and filtered results.
     */
    public rank(results: ISearchResult[], query: ISearchQuery): ISearchResult[] {
        // Apply staleness weighting
        const weighted = results.map((result) => {
            let score = result.score;
            if (result.chunk.metadata.staleness === "legacy") {
                score *= 0.7;
            } else if (result.chunk.metadata.staleness === "aging") {
                score *= 0.85;
            }

            return {
                ...result,
                score: Math.round(score * 100) / 100,
            };
        });

        // Re-sort by adjusted score
        weighted.sort((a, b) => b.score - a.score);

        // Apply verbosity limits
        const limit = query.verbosity === "concise" ? 3 : 10;
        const limited = weighted.slice(0, limit);

        // For verbose mode, augment matchReason with linked chunk titles
        if (query.verbosity === "verbose") {
            for (const result of limited) {
                if (result.chunk.linkIds && result.chunk.linkIds.length > 0) {
                    const linkedTitles = result.chunk.linkIds
                        .map((id) => this._chunkMap.get(id)?.metadata.title)
                        .filter(Boolean)
                        .slice(0, 5);
                    if (linkedTitles.length > 0) {
                        result.matchReason += ` | Related: ${linkedTitles.join(", ")}`;
                    }
                }
            }
        }

        return limited;
    }
}
