import type { IKnowledgeChunk, KnowledgeType } from "../types.js";
import { IngestorBase } from "./IngestorBase.js";
import { GitHubSource } from "../sources/GitHubSource.js";
import type { IGitHubSourceConfig } from "../sources/GitHubSource.js";

/**
 * Configuration for the YouTube ingestor.
 */
export interface IYoutubeIngestorConfig {
    /** GitHub source configuration. */
    sourceConfig?: Partial<IGitHubSourceConfig>;
    /** Only scan files under these subdirectories. */
    includePaths?: string[];
    /** Maximum number of files to scan. */
    maxFiles?: number;
}

/**
 * Scans Documentation Markdown files for embedded YouTube references
 * (URLs, iframe embeds, or custom Youtube components) and creates
 * video-type IKnowledgeChunks.
 */
export class YoutubeIngestor extends IngestorBase {
    /** {@inheritDoc} */
    public readonly sourceType: KnowledgeType = "video";

    private _source: GitHubSource;
    private _config: IYoutubeIngestorConfig;

    // Patterns to find YouTube references in Markdown
    private static readonly _YOUTUBE_PATTERNS: RegExp[] = [
        // Standard YouTube URLs
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)/g,
        // Short YouTube URLs
        /https?:\/\/youtu\.be\/([\w-]+)/g,
        // YouTube embed iframes
        /<iframe[^>]*src=["']https?:\/\/(?:www\.)?youtube\.com\/embed\/([\w-]+)["'][^>]*>/g,
        // Custom Markdown YouTube components: <Youtube id="..."/>
        /<Youtube\s+id=["']([\w-]+)["']\s*\/?>/g,
    ];

    /** @param config - Optional ingestor configuration. */
    constructor(config?: IYoutubeIngestorConfig) {
        super();
        this._config = config || {};
        this._source = new GitHubSource(this._config.sourceConfig);
    }

    /**
     * Scan documentation for YouTube references and produce video-type chunks.
     * @returns Array of video-type knowledge chunks.
     */
    public async ingestAsync(): Promise<IKnowledgeChunk[]> {
        this._log("Scanning documentation for YouTube references...");
        let files = await this._source.getMarkdownFilesAsync();

        if (this._config.includePaths && this._config.includePaths.length > 0) {
            const prefixes = this._config.includePaths;
            files = files.filter((f) => prefixes.some((prefix) => f.includes(prefix)));
        }

        if (this._config.maxFiles && files.length > this._config.maxFiles) {
            files = files.slice(0, this._config.maxFiles);
        }

        // Fetch all files in parallel then extract YouTube chunks
        const fileContents = await Promise.all(
            files.map(async (fp) => {
                try {
                    return { path: fp, content: await this._source.fetchFileContentAsync(fp) };
                } catch (err) {
                    this._warn(`Failed to scan ${fp}: ${err instanceof Error ? err.message : String(err)}`);
                    return null;
                }
            })
        );

        const chunks: IKnowledgeChunk[] = [];

        for (const file of fileContents) {
            if (!file) {
                continue;
            }
            const videoChunks = this._extractYoutubeChunks(file.content, file.path);
            chunks.push(...videoChunks);
        }

        this._log(`Found ${chunks.length} YouTube references.`);
        return chunks;
    }

    private _extractYoutubeChunks(content: string, filePath: string): IKnowledgeChunk[] {
        const chunks: IKnowledgeChunk[] = [];
        const seenIds = new Set<string>();
        const sourceUrl = this._source.buildDocUrl(filePath);

        for (const pattern of YoutubeIngestor._YOUTUBE_PATTERNS) {
            // Reset regex lastIndex for global patterns
            const regex = new RegExp(pattern.source, pattern.flags);
            let match: RegExpExecArray | null;

            while ((match = regex.exec(content)) !== null) {
                const videoId = match[1];
                if (seenIds.has(videoId)) {
                    continue;
                }
                seenIds.add(videoId);

                // Extract surrounding context (up to 200 chars before and after)
                const matchStart = Math.max(0, match.index - 200);
                const matchEnd = Math.min(content.length, match.index + match[0].length + 200);
                const context = content.slice(matchStart, matchEnd).replace(/\n+/g, " ").trim();

                // Try to extract a title from a nearby header
                const title = this._findNearestHeader(content, match.index) || `YouTube Video ${videoId}`;

                chunks.push({
                    id: `video:${videoId}`,
                    content: context,
                    type: "video",
                    metadata: {
                        sourceUrl: sourceUrl,
                        sourceRepo: "BabylonJS/Documentation",
                        title: title,
                    },
                });
            }
        }

        return chunks;
    }

    private _findNearestHeader(content: string, position: number): string | null {
        // Look backwards from the position for the nearest Markdown header
        const before = content.slice(0, position);
        const headerRegex = /^#{1,3}\s+(.+)$/gm;
        let lastMatch: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = headerRegex.exec(before)) !== null) {
            lastMatch = m;
        }
        return lastMatch ? lastMatch[1].trim() : null;
    }
}
