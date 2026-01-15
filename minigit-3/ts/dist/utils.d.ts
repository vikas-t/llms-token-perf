export declare function sha1(data: Buffer | string): string;
export declare function compress(data: Buffer): Buffer;
export declare function decompress(data: Buffer): Buffer;
export declare function findRepoRoot(startPath?: string): string | null;
export declare function getGitDir(repoRoot?: string): string;
export declare function ensureDir(dirPath: string): void;
export declare function relativePath(from: string, to: string): string;
export declare function normalizePath(p: string): string;
export declare function getFileMode(filePath: string): number;
export declare function modeToString(mode: number): string;
export declare function parseMode(modeStr: string): number;
export declare function formatTimestamp(date: Date, tz?: string): string;
export declare function parseTimestamp(str: string): {
    timestamp: number;
    tz: string;
};
export declare function formatAuthor(name: string, email: string, timestamp: string): string;
export declare function parseAuthor(line: string): {
    name: string;
    email: string;
    timestamp: string;
};
export declare function getAuthorInfo(): {
    name: string;
    email: string;
    date: string;
};
export declare function getCommitterInfo(): {
    name: string;
    email: string;
    date: string;
};
export declare function formatDate(timestamp: number, tz?: string): string;
export declare function isValidBranchName(name: string): boolean;
export declare function shortSha(sha: string): string;
