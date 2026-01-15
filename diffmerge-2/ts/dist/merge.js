"use strict";
// Three-way merge functionality
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge3 = merge3;
exports.hasConflicts = hasConflicts;
exports.extractConflicts = extractConflicts;
exports.resolveConflict = resolveConflict;
const utils_1 = require("./utils");
/**
 * Three-way merge with conflict detection.
 */
function merge3(base, ours, theirs, options = {}) {
    const conflictStyle = options.conflict_style ?? 'merge';
    const oursLabel = options.ours_label ?? 'ours';
    const theirsLabel = options.theirs_label ?? 'theirs';
    const baseLabel = options.base_label ?? 'base';
    // Normalize line endings
    const normalizedBase = (0, utils_1.normalizeLineEndings)(base);
    const normalizedOurs = (0, utils_1.normalizeLineEndings)(ours);
    const normalizedTheirs = (0, utils_1.normalizeLineEndings)(theirs);
    // Split into lines
    const baseLines = splitIntoLines(normalizedBase);
    const ourLines = splitIntoLines(normalizedOurs);
    const theirLines = splitIntoLines(normalizedTheirs);
    // Compute LCS between base and each side
    const oursLCS = computeLCS(baseLines, ourLines);
    const theirsLCS = computeLCS(baseLines, theirLines);
    // Build change regions
    const oursChanges = buildChangeRegions(baseLines, ourLines, oursLCS);
    const theirsChanges = buildChangeRegions(baseLines, theirLines, theirsLCS);
    // Merge changes
    const result = mergeChanges(baseLines, ourLines, theirLines, oursChanges, theirsChanges, conflictStyle, oursLabel, theirsLabel, baseLabel);
    return result;
}
function splitIntoLines(content) {
    if (content === '') {
        return [];
    }
    let lines = (0, utils_1.splitLines)(content);
    // Remove trailing empty string artifact from split
    if (lines.length > 0 && lines[lines.length - 1] === '' && content.endsWith('\n')) {
        lines = lines.slice(0, -1);
    }
    return lines;
}
/**
 * Compute LCS between two arrays of lines.
 */
function computeLCS(aLines, bLines) {
    const m = aLines.length;
    const n = bLines.length;
    // Build LCS table
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (aLines[i - 1] === bLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Backtrack to find LCS
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (aLines[i - 1] === bLines[j - 1]) {
            lcs.unshift([i - 1, j - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return lcs;
}
/**
 * Build change regions from LCS.
 */
function buildChangeRegions(baseLines, sideLines, lcs) {
    const regions = [];
    let baseIdx = 0;
    let sideIdx = 0;
    for (const [lcsBaseIdx, lcsSideIdx] of lcs) {
        // Add change region before match if any
        if (baseIdx < lcsBaseIdx || sideIdx < lcsSideIdx) {
            regions.push({
                baseStart: baseIdx,
                baseEnd: lcsBaseIdx,
                sideStart: sideIdx,
                sideEnd: lcsSideIdx,
                type: 'change',
            });
        }
        // Add equal region for match
        regions.push({
            baseStart: lcsBaseIdx,
            baseEnd: lcsBaseIdx + 1,
            sideStart: lcsSideIdx,
            sideEnd: lcsSideIdx + 1,
            type: 'equal',
        });
        baseIdx = lcsBaseIdx + 1;
        sideIdx = lcsSideIdx + 1;
    }
    // Add trailing change if any
    if (baseIdx < baseLines.length || sideIdx < sideLines.length) {
        regions.push({
            baseStart: baseIdx,
            baseEnd: baseLines.length,
            sideStart: sideIdx,
            sideEnd: sideLines.length,
            type: 'change',
        });
    }
    return regions;
}
/**
 * Merge changes from both sides.
 * Uses a more robust algorithm that properly handles overlapping regions.
 */
function mergeChanges(baseLines, ourLines, theirLines, oursChanges, theirsChanges, conflictStyle, oursLabel, theirsLabel, baseLabel) {
    const resultLines = [];
    const conflicts = [];
    let currentLine = 1;
    let baseIdx = 0;
    let oursIdx = 0;
    let theirsIdx = 0;
    while (oursIdx < oursChanges.length || theirsIdx < theirsChanges.length) {
        const oursRegion = oursIdx < oursChanges.length ? oursChanges[oursIdx] : null;
        const theirsRegion = theirsIdx < theirsChanges.length ? theirsChanges[theirsIdx] : null;
        if (!oursRegion && !theirsRegion) {
            break;
        }
        // Handle case where only one side has remaining regions
        if (!oursRegion) {
            // Only theirs has regions
            if (theirsRegion.type === 'equal') {
                resultLines.push(...theirLines.slice(theirsRegion.sideStart, theirsRegion.sideEnd));
            }
            else {
                resultLines.push(...theirLines.slice(theirsRegion.sideStart, theirsRegion.sideEnd));
            }
            theirsIdx++;
            continue;
        }
        if (!theirsRegion) {
            // Only ours has regions
            if (oursRegion.type === 'equal') {
                resultLines.push(...ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd));
            }
            else {
                resultLines.push(...ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd));
            }
            oursIdx++;
            continue;
        }
        // Both have regions - check for overlap
        const oursBaseStart = oursRegion.baseStart;
        const oursBaseEnd = oursRegion.baseEnd;
        const theirsBaseStart = theirsRegion.baseStart;
        const theirsBaseEnd = theirsRegion.baseEnd;
        // Check if regions overlap in base
        const overlap = (oursBaseStart < theirsBaseEnd && oursBaseEnd > theirsBaseStart) ||
            (oursBaseStart === oursBaseEnd && oursBaseStart >= theirsBaseStart && oursBaseStart <= theirsBaseEnd) ||
            (theirsBaseStart === theirsBaseEnd && theirsBaseStart >= oursBaseStart && theirsBaseStart <= oursBaseEnd);
        if (!overlap) {
            // No overlap - process the one that comes first
            if (oursBaseStart < theirsBaseStart) {
                if (oursRegion.type === 'equal') {
                    resultLines.push(...ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd));
                }
                else {
                    resultLines.push(...ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd));
                }
                oursIdx++;
            }
            else {
                if (theirsRegion.type === 'equal') {
                    resultLines.push(...theirLines.slice(theirsRegion.sideStart, theirsRegion.sideEnd));
                }
                else {
                    resultLines.push(...theirLines.slice(theirsRegion.sideStart, theirsRegion.sideEnd));
                }
                theirsIdx++;
            }
            continue;
        }
        // Regions overlap - need to merge them
        const oursIsChange = oursRegion.type === 'change';
        const theirsIsChange = theirsRegion.type === 'change';
        if (!oursIsChange && !theirsIsChange) {
            // Both equal - output the content
            resultLines.push(...ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd));
            oursIdx++;
            theirsIdx++;
        }
        else if (oursIsChange && !theirsIsChange) {
            // Ours changed, theirs didn't for this specific overlap
            // But we need to check if ours change covers base content that theirs keeps
            // This is a conflict if ours deletes/changes lines that theirs expects to keep
            const oursContent = ourLines.slice(oursRegion.sideStart, oursRegion.sideEnd);
            const baseContent = baseLines.slice(oursRegion.baseStart, oursRegion.baseEnd);
            // Check if theirs has any change regions within our base range
            let theirsHasChangeInRange = false;
            for (let i = theirsIdx; i < theirsChanges.length; i++) {
                const tr = theirsChanges[i];
                if (tr.baseStart >= oursBaseEnd)
                    break;
                if (tr.type === 'change' && tr.baseStart < oursBaseEnd && tr.baseEnd > oursBaseStart) {
                    theirsHasChangeInRange = true;
                    break;
                }
            }
            if (theirsHasChangeInRange || (baseContent.length > 0 && oursContent.length === 0 && theirsRegion.sideEnd - theirsRegion.sideStart > 0)) {
                // Potential conflict - ours deleted/changed content that theirs also touches
                // Gather all of theirs content in this range
                let theirContent = [];
                let theirsEndIdx = theirsIdx;
                while (theirsEndIdx < theirsChanges.length && theirsChanges[theirsEndIdx].baseStart < oursBaseEnd) {
                    const tr = theirsChanges[theirsEndIdx];
                    theirContent.push(...theirLines.slice(tr.sideStart, tr.sideEnd));
                    theirsEndIdx++;
                }
                if (arraysEqual(oursContent, theirContent)) {
                    resultLines.push(...oursContent);
                }
                else {
                    // Conflict
                    const startLine = currentLine + resultLines.length;
                    resultLines.push(`<<<<<<< ${oursLabel}`);
                    resultLines.push(...oursContent);
                    if (conflictStyle === 'diff3') {
                        resultLines.push(`||||||| ${baseLabel}`);
                        resultLines.push(...baseContent);
                    }
                    resultLines.push('=======');
                    resultLines.push(...theirContent);
                    resultLines.push(`>>>>>>> ${theirsLabel}`);
                    const endLine = currentLine + resultLines.length - 1;
                    conflicts.push({
                        base: baseContent.join('\n'),
                        ours: oursContent.join('\n'),
                        theirs: theirContent.join('\n'),
                        start_line: startLine,
                        end_line: endLine,
                    });
                }
                oursIdx++;
                theirsIdx = theirsEndIdx;
            }
            else {
                // Ours changed, theirs kept same - accept ours change
                resultLines.push(...oursContent);
                oursIdx++;
                // Skip theirs regions covered by ours
                while (theirsIdx < theirsChanges.length && theirsChanges[theirsIdx].baseEnd <= oursBaseEnd) {
                    theirsIdx++;
                }
            }
        }
        else if (!oursIsChange && theirsIsChange) {
            // Theirs changed, ours didn't
            const theirContent = theirLines.slice(theirsRegion.sideStart, theirsRegion.sideEnd);
            const baseContent = baseLines.slice(theirsRegion.baseStart, theirsRegion.baseEnd);
            // Check if ours has any change regions within theirs base range
            let oursHasChangeInRange = false;
            for (let i = oursIdx; i < oursChanges.length; i++) {
                const or = oursChanges[i];
                if (or.baseStart >= theirsBaseEnd)
                    break;
                if (or.type === 'change' && or.baseStart < theirsBaseEnd && or.baseEnd > theirsBaseStart) {
                    oursHasChangeInRange = true;
                    break;
                }
            }
            if (oursHasChangeInRange || (baseContent.length > 0 && theirContent.length === 0 && oursRegion.sideEnd - oursRegion.sideStart > 0)) {
                // Conflict
                let ourContent = [];
                let oursEndIdx = oursIdx;
                while (oursEndIdx < oursChanges.length && oursChanges[oursEndIdx].baseStart < theirsBaseEnd) {
                    const or = oursChanges[oursEndIdx];
                    ourContent.push(...ourLines.slice(or.sideStart, or.sideEnd));
                    oursEndIdx++;
                }
                if (arraysEqual(ourContent, theirContent)) {
                    resultLines.push(...ourContent);
                }
                else {
                    const startLine = currentLine + resultLines.length;
                    resultLines.push(`<<<<<<< ${oursLabel}`);
                    resultLines.push(...ourContent);
                    if (conflictStyle === 'diff3') {
                        resultLines.push(`||||||| ${baseLabel}`);
                        resultLines.push(...baseContent);
                    }
                    resultLines.push('=======');
                    resultLines.push(...theirContent);
                    resultLines.push(`>>>>>>> ${theirsLabel}`);
                    const endLine = currentLine + resultLines.length - 1;
                    conflicts.push({
                        base: baseContent.join('\n'),
                        ours: ourContent.join('\n'),
                        theirs: theirContent.join('\n'),
                        start_line: startLine,
                        end_line: endLine,
                    });
                }
                oursIdx = oursEndIdx;
                theirsIdx++;
            }
            else {
                // Theirs changed, ours kept same - accept theirs change
                resultLines.push(...theirContent);
                theirsIdx++;
                // Skip ours regions covered by theirs
                while (oursIdx < oursChanges.length && oursChanges[oursIdx].baseEnd <= theirsBaseEnd) {
                    oursIdx++;
                }
            }
        }
        else {
            // Both changed - check if same or conflict
            // Find the full extent of overlapping changes
            let oursEndIdx = oursIdx + 1;
            let theirsEndIdx = theirsIdx + 1;
            let maxBaseEnd = Math.max(oursBaseEnd, theirsBaseEnd);
            // Extend to include all overlapping change regions
            while (oursEndIdx < oursChanges.length && oursChanges[oursEndIdx].baseStart < maxBaseEnd) {
                maxBaseEnd = Math.max(maxBaseEnd, oursChanges[oursEndIdx].baseEnd);
                oursEndIdx++;
            }
            while (theirsEndIdx < theirsChanges.length && theirsChanges[theirsEndIdx].baseStart < maxBaseEnd) {
                maxBaseEnd = Math.max(maxBaseEnd, theirsChanges[theirsEndIdx].baseEnd);
                theirsEndIdx++;
            }
            // Gather content from both sides
            const ourContent = [];
            for (let i = oursIdx; i < oursEndIdx; i++) {
                ourContent.push(...ourLines.slice(oursChanges[i].sideStart, oursChanges[i].sideEnd));
            }
            const theirContent = [];
            for (let i = theirsIdx; i < theirsEndIdx; i++) {
                theirContent.push(...theirLines.slice(theirsChanges[i].sideStart, theirsChanges[i].sideEnd));
            }
            const minBaseStart = Math.min(oursRegion.baseStart, theirsRegion.baseStart);
            const baseContent = baseLines.slice(minBaseStart, maxBaseEnd);
            if (arraysEqual(ourContent, theirContent)) {
                // Same change - no conflict
                resultLines.push(...ourContent);
            }
            else {
                // Conflict
                const startLine = currentLine + resultLines.length;
                resultLines.push(`<<<<<<< ${oursLabel}`);
                resultLines.push(...ourContent);
                if (conflictStyle === 'diff3') {
                    resultLines.push(`||||||| ${baseLabel}`);
                    resultLines.push(...baseContent);
                }
                resultLines.push('=======');
                resultLines.push(...theirContent);
                resultLines.push(`>>>>>>> ${theirsLabel}`);
                const endLine = currentLine + resultLines.length - 1;
                conflicts.push({
                    base: baseContent.join('\n'),
                    ours: ourContent.join('\n'),
                    theirs: theirContent.join('\n'),
                    start_line: startLine,
                    end_line: endLine,
                });
            }
            oursIdx = oursEndIdx;
            theirsIdx = theirsEndIdx;
        }
    }
    // Build result content
    let content = resultLines.join('\n');
    if (resultLines.length > 0) {
        content += '\n';
    }
    return {
        content,
        has_conflicts: conflicts.length > 0,
        conflicts,
    };
}
function findRegionAt(regions, startIdx, basePos) {
    for (let i = startIdx; i < regions.length; i++) {
        const region = regions[i];
        // Special case: trailing additions where baseStart === baseEnd === basePos
        if (region.baseStart === basePos && region.baseEnd === basePos && region.type === 'change') {
            return region;
        }
        if (region.baseStart <= basePos && region.baseEnd > basePos) {
            return region;
        }
        if (region.baseStart > basePos) {
            return null;
        }
    }
    return null;
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}
/**
 * Check if content contains conflict markers.
 */
function hasConflicts(content) {
    const hasStart = content.includes('<<<<<<<');
    const hasMid = content.includes('=======');
    const hasEnd = content.includes('>>>>>>>');
    return hasStart && hasMid && hasEnd;
}
/**
 * Extract conflict regions from merged content.
 */
function extractConflicts(content) {
    const conflicts = [];
    const lines = content.split('\n');
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith('<<<<<<<')) {
            const startLine = i + 1;
            const oursLines = [];
            const baseLines = [];
            const theirLines = [];
            let inOurs = true;
            let inBase = false;
            let inTheirs = false;
            i++;
            while (i < lines.length) {
                const line = lines[i];
                if (line.startsWith('|||||||')) {
                    inOurs = false;
                    inBase = true;
                    i++;
                    continue;
                }
                if (line === '=======' || line.startsWith('=======')) {
                    inOurs = false;
                    inBase = false;
                    inTheirs = true;
                    i++;
                    continue;
                }
                if (line.startsWith('>>>>>>>')) {
                    const endLine = i + 1;
                    conflicts.push({
                        base: baseLines.join('\n'),
                        ours: oursLines.join('\n'),
                        theirs: theirLines.join('\n'),
                        start_line: startLine,
                        end_line: endLine,
                    });
                    break;
                }
                if (inOurs) {
                    oursLines.push(line);
                }
                else if (inBase) {
                    baseLines.push(line);
                }
                else if (inTheirs) {
                    theirLines.push(line);
                }
                i++;
            }
        }
        i++;
    }
    return conflicts;
}
/**
 * Resolve a specific conflict in the content.
 */
function resolveConflict(content, conflictIndex, resolution) {
    const lines = content.split('\n');
    const result = [];
    let conflictCount = 0;
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith('<<<<<<<')) {
            if (conflictCount === conflictIndex) {
                // This is the conflict to resolve
                const oursLines = [];
                const baseLines = [];
                const theirLines = [];
                let inOurs = true;
                let inBase = false;
                let inTheirs = false;
                i++;
                while (i < lines.length) {
                    const line = lines[i];
                    if (line.startsWith('|||||||')) {
                        inOurs = false;
                        inBase = true;
                        i++;
                        continue;
                    }
                    if (line === '=======' || line.startsWith('=======')) {
                        inOurs = false;
                        inBase = false;
                        inTheirs = true;
                        i++;
                        continue;
                    }
                    if (line.startsWith('>>>>>>>')) {
                        // Resolve based on resolution type
                        let resolvedLines;
                        if (resolution === 'ours') {
                            resolvedLines = oursLines;
                        }
                        else if (resolution === 'theirs') {
                            resolvedLines = theirLines;
                        }
                        else if (resolution === 'base') {
                            resolvedLines = baseLines;
                        }
                        else {
                            // Custom resolution - use the string directly
                            resolvedLines = resolution.split('\n');
                            // Remove trailing empty string if resolution ends with newline
                            if (resolvedLines.length > 0 &&
                                resolvedLines[resolvedLines.length - 1] === '' &&
                                resolution.endsWith('\n')) {
                                resolvedLines = resolvedLines.slice(0, -1);
                            }
                        }
                        result.push(...resolvedLines);
                        break;
                    }
                    if (inOurs) {
                        oursLines.push(line);
                    }
                    else if (inBase) {
                        baseLines.push(line);
                    }
                    else if (inTheirs) {
                        theirLines.push(line);
                    }
                    i++;
                }
                conflictCount++;
            }
            else {
                // Keep this conflict as-is
                result.push(lines[i]);
                i++;
                while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
                    result.push(lines[i]);
                    i++;
                }
                if (i < lines.length) {
                    result.push(lines[i]);
                }
                conflictCount++;
            }
        }
        else {
            result.push(lines[i]);
        }
        i++;
    }
    return result.join('\n');
}
