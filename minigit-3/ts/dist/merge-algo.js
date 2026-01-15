"use strict";
// Three-way merge with conflict detection
Object.defineProperty(exports, "__esModule", { value: true });
exports.threeWayMerge = threeWayMerge;
exports.mergeFiles = mergeFiles;
exports.hasConflictMarkers = hasConflictMarkers;
// Simple LCS-based diff for merge
function lcs(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp;
}
function diffLines(base, other) {
    const dp = lcs(base, other);
    const result = [];
    let i = base.length;
    let j = other.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && base[i - 1] === other[j - 1]) {
            result.unshift({ type: 'equal', line: base[i - 1], baseIndex: i - 1, otherIndex: j - 1 });
            i--;
            j--;
        }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'insert', line: other[j - 1], baseIndex: i, otherIndex: j - 1 });
            j--;
        }
        else {
            result.unshift({ type: 'delete', line: base[i - 1], baseIndex: i - 1, otherIndex: j });
            i--;
        }
    }
    return result;
}
function threeWayMerge(baseContent, oursContent, theirsContent, branchName = 'branch') {
    const baseLines = baseContent.split('\n');
    const oursLines = oursContent.split('\n');
    const theirsLines = theirsContent.split('\n');
    // Get diffs
    const oursDiff = diffLines(baseLines, oursLines);
    const theirsDiff = diffLines(baseLines, theirsLines);
    // Build merged content
    const result = [];
    const conflicts = [];
    let baseIndex = 0;
    let oursIndex = 0;
    let theirsIndex = 0;
    while (baseIndex < baseLines.length || oursIndex < oursLines.length || theirsIndex < theirsLines.length) {
        const oursEqual = oursIndex < oursLines.length && (baseIndex >= baseLines.length || oursLines[oursIndex] === baseLines[baseIndex]);
        const theirsEqual = theirsIndex < theirsLines.length && (baseIndex >= baseLines.length || theirsLines[theirsIndex] === baseLines[baseIndex]);
        if (baseIndex < baseLines.length && oursEqual && theirsEqual) {
            // Both unchanged
            result.push(baseLines[baseIndex]);
            baseIndex++;
            oursIndex++;
            theirsIndex++;
        }
        else if (oursEqual && !theirsEqual && theirsIndex < theirsLines.length) {
            // Ours unchanged, theirs changed - take theirs
            result.push(theirsLines[theirsIndex]);
            if (baseIndex < baseLines.length)
                baseIndex++;
            oursIndex++;
            theirsIndex++;
        }
        else if (!oursEqual && theirsEqual && oursIndex < oursLines.length) {
            // Theirs unchanged, ours changed - take ours
            result.push(oursLines[oursIndex]);
            if (baseIndex < baseLines.length)
                baseIndex++;
            oursIndex++;
            theirsIndex++;
        }
        else if (oursIndex < oursLines.length && theirsIndex < theirsLines.length &&
            oursLines[oursIndex] === theirsLines[theirsIndex]) {
            // Both changed the same way
            result.push(oursLines[oursIndex]);
            if (baseIndex < baseLines.length)
                baseIndex++;
            oursIndex++;
            theirsIndex++;
        }
        else {
            // Conflict - collect conflicting regions
            const oursConflict = [];
            const theirsConflict = [];
            // Collect ours changes
            while (oursIndex < oursLines.length &&
                (baseIndex >= baseLines.length || oursLines[oursIndex] !== baseLines[baseIndex])) {
                oursConflict.push(oursLines[oursIndex]);
                oursIndex++;
            }
            // Collect theirs changes
            while (theirsIndex < theirsLines.length &&
                (baseIndex >= baseLines.length || theirsLines[theirsIndex] !== baseLines[baseIndex])) {
                theirsConflict.push(theirsLines[theirsIndex]);
                theirsIndex++;
            }
            // Skip deleted base line
            if (baseIndex < baseLines.length)
                baseIndex++;
            // Add conflict markers
            if (oursConflict.length > 0 || theirsConflict.length > 0) {
                result.push('<<<<<<< HEAD');
                result.push(...oursConflict);
                result.push('=======');
                result.push(...theirsConflict);
                result.push(`>>>>>>> ${branchName}`);
                conflicts.push(`conflict at line ${result.length - oursConflict.length - theirsConflict.length - 3}`);
            }
        }
    }
    return {
        success: conflicts.length === 0,
        conflicts,
        mergedContent: result.join('\n')
    };
}
function mergeFiles(baseContent, oursContent, theirsContent, branchName = 'branch') {
    // Handle cases where files are added or deleted
    if (baseContent === null) {
        // File added in one or both branches
        if (oursContent === null && theirsContent !== null) {
            return { success: true, conflicts: [], mergedContent: theirsContent };
        }
        if (theirsContent === null && oursContent !== null) {
            return { success: true, conflicts: [], mergedContent: oursContent };
        }
        if (oursContent !== null && theirsContent !== null) {
            if (oursContent === theirsContent) {
                return { success: true, conflicts: [], mergedContent: oursContent };
            }
            // Both added different content - conflict
            return threeWayMerge('', oursContent, theirsContent, branchName);
        }
        return { success: true, conflicts: [], mergedContent: '' };
    }
    if (oursContent === null && theirsContent === null) {
        // Both deleted
        return { success: true, conflicts: [], mergedContent: '' };
    }
    if (oursContent === null) {
        // We deleted, they modified - conflict
        return {
            success: false,
            conflicts: ['file deleted in HEAD but modified in branch'],
            mergedContent: theirsContent || ''
        };
    }
    if (theirsContent === null) {
        // They deleted, we modified - conflict
        return {
            success: false,
            conflicts: ['file modified in HEAD but deleted in branch'],
            mergedContent: oursContent
        };
    }
    // Both exist - do three-way merge
    return threeWayMerge(baseContent, oursContent, theirsContent, branchName);
}
function hasConflictMarkers(content) {
    return content.includes('<<<<<<<') && content.includes('=======') && content.includes('>>>>>>>');
}
