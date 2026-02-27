import * as fs from "fs";
import * as path from "path";

/**
 * Configuration for the GitHub content source.
 */
export interface IGitHubSourceConfig {
    /** Repository owner. */
    owner: string;
    /** Repository name. */
    repo: string;
    /** Git branch to fetch from. */
    branch: string;
    /** Base directory path within the repo. */
    basePath: string;
    /** Local directory for caching fetched content. */
    cacheDir?: string;
}

interface IGitHubTreeItem {
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
    url: string;
}

interface IGitHubTreeResponse {
    sha: string;
    url: string;
    tree: IGitHubTreeItem[];
    truncated: boolean;
}

const DefaultConfig: IGitHubSourceConfig = {
    owner: "BabylonJS",
    repo: "Documentation",
    branch: "master",
    basePath: "content",
};

/**
 * Fetches file trees and raw content from the GitHub API.
 * Caches results to avoid rate-limiting on repeated runs.
 */
export class GitHubSource {
    private _config: IGitHubSourceConfig;
    private _cacheDir: string;
    private _memoryCache: Map<string, string> = new Map();

    /** @param config - Optional partial config overrides. */
    constructor(config?: Partial<IGitHubSourceConfig>) {
        this._config = { ...DefaultConfig, ...config };
        this._cacheDir = this._config.cacheDir || path.join(process.cwd(), ".cache", "knowledge");
    }

    /**
     * Get the list of Markdown file paths in the repo under basePath.
     * @returns Array of file paths.
     */
    public async getMarkdownFilesAsync(): Promise<string[]> {
        const cacheKey = `tree_${this._config.owner}_${this._config.repo}_${this._config.branch}`;
        const cached = this._readFromCache(cacheKey);

        let tree: IGitHubTreeItem[];
        if (cached) {
            tree = JSON.parse(cached) as IGitHubTreeItem[];
        } else {
            const url = `https://api.github.com/repos/${this._config.owner}/${this._config.repo}/git/trees/${this._config.branch}?recursive=1`;
            const response = await fetch(url, {
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Accept: "application/vnd.github.v3+json",
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "User-Agent": "BabylonJS-Knowledge",
                },
            });

            if (!response.ok) {
                throw new Error(`GitHub API error ${response.status}: ${response.statusText}. URL: ${url}`);
            }

            const data = (await response.json()) as IGitHubTreeResponse;
            tree = data.tree;
            this._writeToCache(cacheKey, JSON.stringify(tree));
        }

        return tree.filter((item) => item.type === "blob" && item.path.startsWith(this._config.basePath) && item.path.endsWith(".md")).map((item) => item.path);
    }

    /**
     * Fetch the raw content of a file from the repo.
     * @param filePath - Path to the file within the repo.
     * @returns The file content as a string.
     */
    public async fetchFileContentAsync(filePath: string): Promise<string> {
        const cacheKey = `file_${filePath.replace(/\//g, "_")}`;

        // In-memory cache first
        const memCached = this._memoryCache.get(cacheKey);
        if (memCached) {
            return memCached;
        }

        // Disk cache second
        const diskCached = this._readFromCache(cacheKey);
        if (diskCached) {
            this._memoryCache.set(cacheKey, diskCached);
            return diskCached;
        }

        // Fetch from GitHub raw content (no auth required, no rate limit for reasonable use)
        const url = `https://raw.githubusercontent.com/${this._config.owner}/${this._config.repo}/${this._config.branch}/${filePath}`;
        const response = await fetch(url, {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { "User-Agent": "BabylonJS-Knowledge" },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }

        const content = await response.text();
        this._memoryCache.set(cacheKey, content);
        this._writeToCache(cacheKey, content);
        return content;
    }

    /**
     * Build a documentation URL from a file path.
     * @param filePath - Path to the file within the repo.
     * @returns The doc.babylonjs.com URL.
     */
    public buildDocUrl(filePath: string): string {
        // e.g., "content/features/physics.md" → "https://doc.babylonjs.com/features/physics"
        let urlPath = filePath;
        if (urlPath.startsWith(this._config.basePath + "/")) {
            urlPath = urlPath.slice(this._config.basePath.length + 1);
        }
        urlPath = urlPath.replace(/\.md$/, "").replace(/\/index$/, "");
        return `https://doc.babylonjs.com/${urlPath}`;
    }

    private _ensureCacheDir(): void {
        if (!fs.existsSync(this._cacheDir)) {
            fs.mkdirSync(this._cacheDir, { recursive: true });
        }
    }

    private _readFromCache(key: string): string | null {
        const filePath = path.join(this._cacheDir, key + ".cache");
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, "utf-8");
            }
        } catch {
            // Cache miss — proceed without cache
        }
        return null;
    }

    private _writeToCache(key: string, data: string): void {
        try {
            this._ensureCacheDir();
            const filePath = path.join(this._cacheDir, key + ".cache");
            fs.writeFileSync(filePath, data, "utf-8");
        } catch {
            // Non-critical — silently continue
        }
    }
}
