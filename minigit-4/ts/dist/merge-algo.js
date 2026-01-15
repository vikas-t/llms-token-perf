"use strict";
// Three-way merge with conflict detection
Object.defineProperty(exports, "__esModule", { value: true });
exports.merge3Way = merge3Way;
exports.findMergeBase = findMergeBase;
function merge3Way(base, ours, theirs) {
    // If base is null, treat as new file in both branches
    if (base === null) {
        if (ours === theirs) {
            return { content: ours, hasConflict: false };
        }
        // Both added with different content - conflict
        return {
            content: formatConflict(ours, theirs, 'HEAD', 'incoming'),
            hasConflict: true,
        };
    }
    // If one side is unchanged
    if (base === ours) {
        return { content: theirs, hasConflict: false };
    }
    if (base === theirs) {
        return { content: ours, hasConflict: false };
    }
    // Both sides changed - need to merge
    const baseLines = base.split('\n');
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');
    const result = mergeLines(baseLines, oursLines, theirsLines);
    return result;
}
function mergeLines(base, ours, theirs) {
    // Simple LCS-based merge
    const oursChanges = computeChanges(base, ours);
    const theirsChanges = computeChanges(base, theirs);
    const result = [];
    let hasConflict = false;
    let baseIdx = 0;
    let oursIdx = 0;
    let theirsIdx = 0;
    while (baseIdx < base.length || oursIdx < ours.length || theirsIdx < theirs.length) {
        const oursChange = oursChanges.get(baseIdx);
        const theirsChange = theirsChanges.get(baseIdx);
        if (baseIdx >= base.length) {
            // Past end of base - handle remaining additions
            if (oursIdx < ours.length && theirsIdx < theirs.length) {
                if (ours.slice(oursIdx).join('\n') === theirs.slice(theirsIdx).join('\n')) {
                    result.push(...ours.slice(oursIdx));
                }
                else {
                    // Conflict at end
                    hasConflict = true;
                    result.push('<<<<<<< HEAD');
                    result.push(...ours.slice(oursIdx));
                    result.push('=======');
                    result.push(...theirs.slice(theirsIdx));
                    result.push('>>>>>>> incoming');
                }
            }
            else if (oursIdx < ours.length) {
                result.push(...ours.slice(oursIdx));
            }
            else if (theirsIdx < theirs.length) {
                result.push(...theirs.slice(theirsIdx));
            }
            break;
        }
        if (!oursChange && !theirsChange) {
            // No changes - keep base line
            result.push(base[baseIdx]);
            baseIdx++;
            oursIdx++;
            theirsIdx++;
        }
        else if (oursChange && !theirsChange) {
            // Only ours changed
            if (oursChange.type === 'delete') {
                baseIdx++;
                theirsIdx++;
            }
            else if (oursChange.type === 'modify') {
                result.push(oursChange.newLine);
                baseIdx++;
                oursIdx++;
                theirsIdx++;
            }
            else if (oursChange.type === 'insert') {
                result.push(oursChange.newLine);
                oursIdx++;
            }
        }
        else if (!oursChange && theirsChange) {
            // Only theirs changed
            if (theirsChange.type === 'delete') {
                baseIdx++;
                oursIdx++;
            }
            else if (theirsChange.type === 'modify') {
                result.push(theirsChange.newLine);
                baseIdx++;
                oursIdx++;
                theirsIdx++;
            }
            else if (theirsChange.type === 'insert') {
                result.push(theirsChange.newLine);
                theirsIdx++;
            }
        }
        else {
            // Both changed - check for conflict
            if (oursChange.type === theirsChange.type) {
                if (oursChange.type === 'delete') {
                    // Both deleted - ok
                    baseIdx++;
                }
                else if (oursChange.newLine === theirsChange.newLine) {
                    // Both made same change - ok
                    result.push(oursChange.newLine);
                    baseIdx++;
                    oursIdx++;
                    theirsIdx++;
                }
                else {
                    // Different changes - conflict
                    hasConflict = true;
                    result.push('<<<<<<< HEAD');
                    result.push(oursChange.newLine || '');
                    result.push('=======');
                    result.push(theirsChange.newLine || '');
                    result.push('>>>>>>> incoming');
                    baseIdx++;
                    oursIdx++;
                    theirsIdx++;
                }
            }
            else {
                // Different change types - conflict
                hasConflict = true;
                const oursContent = oursChange.type === 'delete' ? '' : oursChange.newLine || base[baseIdx];
                const theirsContent = theirsChange.type === 'delete' ? '' : theirsChange.newLine || base[baseIdx];
                result.push('<<<<<<< HEAD');
                if (oursContent)
                    result.push(oursContent);
                result.push('=======');
                if (theirsContent)
                    result.push(theirsContent);
                result.push('>>>>>>> incoming');
                baseIdx++;
                if (oursChange.type !== 'delete')
                    oursIdx++;
                if (theirsChange.type !== 'delete')
                    theirsIdx++;
            }
        }
    }
    return { content: result.join('\n'), hasConflict };
}
function computeChanges(base, modified) {
    const changes = new Map();
    // Simple diff - not a full Myers diff for simplicity
    const lcs = longestCommonSubsequence(base, modified);
    let baseIdx = 0;
    let modIdx = 0;
    let lcsIdx = 0;
    while (baseIdx < base.length || modIdx < modified.length) {
        if (lcsIdx < lcs.length && baseIdx < base.length && modIdx < modified.length) {
            if (base[baseIdx] === lcs[lcsIdx] && modified[modIdx] === lcs[lcsIdx]) {
                // Same line - no change
                baseIdx++;
                modIdx++;
                lcsIdx++;
            }
            else if (base[baseIdx] !== lcs[lcsIdx]) {
                // Line deleted from base
                changes.set(baseIdx, { type: 'delete', baseIdx });
                baseIdx++;
            }
            else {
                // Line added in modified
                changes.set(baseIdx, { type: 'insert', baseIdx, newLine: modified[modIdx] });
                modIdx++;
            }
        }
        else if (baseIdx < base.length) {
            // Remaining lines in base are deleted
            changes.set(baseIdx, { type: 'delete', baseIdx });
            baseIdx++;
        }
        else if (modIdx < modified.length) {
            // Remaining lines in modified are added
            changes.set(baseIdx, { type: 'insert', baseIdx, newLine: modified[modIdx] });
            modIdx++;
        }
    }
    return changes;
}
function longestCommonSubsequence(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
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
    // Backtrack
    const result = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            result.unshift(a[i - 1]);
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
    return result;
}
function formatConflict(ours, theirs, oursLabel, theirsLabel) {
    const lines = [];
    lines.push(`<<<<<<< ${oursLabel}`);
    lines.push(ours);
    lines.push('=======');
    lines.push(theirs);
    lines.push(`>>>>>>> ${theirsLabel}`);
    return lines.join('\n');
}
function findMergeBase(repoRoot, sha1, sha2, getParents) {
    // Find common ancestor using BFS from both commits
    const ancestors1 = new Set();
    const queue1 = [sha1];
    // Build ancestor set for sha1
    while (queue1.length > 0) {
        const current = queue1.shift();
        if (ancestors1.has(current))
            continue;
        ancestors1.add(current);
        const parents = getParents(current);
        queue1.push(...parents);
    }
    // BFS from sha2 to find first common ancestor
    const visited = new Set();
    const queue2 = [sha2];
    while (queue2.length > 0) {
        const current = queue2.shift();
        if (visited.has(current))
            continue;
        visited.add(current);
        if (ancestors1.has(current)) {
            return current;
        }
        const parents = getParents(current);
        queue2.push(...parents);
    }
    return null;
}
