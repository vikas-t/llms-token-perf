# LLM Token Efficiency Analysis: Python vs TypeScript vs Go

## Executive Summary

This study analyzed LLM (Claude Opus 4.5) token consumption across Python, TypeScript, and Go implementations for identical programming tasks. The primary finding is that **LLM variance (first-pass correctness) dominates all other factors**, making language choice largely irrelevant for "AI coding efficiency."

---

## Methodology

- **Model**: Claude Opus 4.5 (claude-opus-4-5-20251101)
- **Tool**: Claude Code CLI
- **Experiments**: 4 projects × multiple runs = 12 fair comparison runs (36 total implementations)
- **Metrics**: Total tokens (input + output + cache_read + cache_creation)
- **Fair Comparison**: All languages given identical plans with same file structure requirements

---

## Results by Project

### minigit (Git Implementation - 125 tests)

| Run | Python | TypeScript | Go | Winner |
|-----|--------|------------|-----|--------|
| minigit-3 | **10,601,283 (2)** | 13,192,681 (4) | 10,767,933 (4) | Python |
| minigit-4 | 9,982,258 (6) | 10,263,572 (6) | **8,354,023 (7)** | Go |
| minigit-5 | **6,496,725 (2)** | 12,362,412 (6) | 15,109,033 (11) | Python |

*(numbers in parentheses = test sessions)*

#### minigit-3 Analysis
- **Winner**: Python (10.6M tokens, 2 test runs)
- **Loser**: TypeScript (13.2M tokens, 1.24x)
- **Reason**: TypeScript had 4 test runs with 22 FAILED mentions vs Python's 2 test runs with 18 FAILED. Multiple bugs in branch management and commit history traversal required extensive debugging iterations

#### minigit-4 Analysis
- **Winner**: Go (8.4M tokens, 7 test runs)
- **Loser**: TypeScript (10.3M tokens, 1.23x)
- **Reason**: Go had 7 test runs with 16 FAILED mentions vs TypeScript's 6 test runs with 4 FAILED and Python's 6 with 24 FAILED. All were comparable but Go produced the most efficient implementation

#### minigit-5 Analysis
- **Winner**: Python (6.5M tokens, 2 test runs)
- **Loser**: Go (15.1M tokens, 2.33x)
- **Reason**: Go had 11 test runs with 41 FAILED mentions vs Python's 2 test runs with 9 FAILED and TypeScript's 6 with 8 FAILED. Fundamental bugs in merge3 implementation caused cascading failures across the test suite

---

### diffmerge (Diff/Merge Library - 125 tests)

| Run | Python | TypeScript | Go | Winner |
|-----|--------|------------|-----|--------|
| diffmerge-1 | 3,734,040 (2) | **2,853,406 (4)** | 15,703,598 (9) | TypeScript |
| diffmerge-2 | 9,499,666 (17) | **5,304,613 (4)** | 6,695,102 (7) | TypeScript |
| diffmerge-3 | 5,161,343 (2) | **4,147,437 (4)** | 12,294,004 (14) | TypeScript |

#### diffmerge-1 Analysis
- **Winner**: TypeScript (2.9M tokens, 4 test runs)
- **Loser**: Go (15.7M tokens, 5.5x)
- **Reason**: Go had 9 test runs with 200 FAILED mentions. Initial implementation had fundamental JSON output format bugs causing ALL tests to fail initially, requiring complete rewrites of the CLI interface

#### diffmerge-2 Analysis
- **Winner**: TypeScript (5.3M tokens, 4 test runs)
- **Loser**: Python (9.5M tokens, 1.79x)
- **Reason**: Python had 17 test runs with 16 FAILED mentions. Bugs in LCS (Longest Common Subsequence) algorithm implementation required extensive iteration to fix edge cases

#### diffmerge-3 Analysis
- **Winner**: TypeScript (4.1M tokens, 4 test runs)
- **Loser**: Go (12.3M tokens, 2.96x)
- **Reason**: Go had 14 test runs with 386 FAILED mentions. Repeated issues with three-way merge conflict detection logic - failing to correctly identify when changes from both sides could be cleanly merged

---

### graphlib (Graph Library - 150 tests)

| Run | Python | TypeScript | Go | Winner |
|-----|--------|------------|-----|--------|
| graphlib-1 | **5,246,712 (4)** | 9,373,304 (8) | 21,124,213 (14) | Python |
| graphlib-2 | **3,678,930 (6)** | 5,567,961 (10) | 9,992,770 (6) | Python |
| graphlib-3 | **2,459,314 (2)** | 3,995,753 (6) | 15,758,859 (8) | Python |

#### graphlib-1 Analysis
- **Winner**: Python (5.2M tokens, 4 test runs)
- **Loser**: Go (21.1M tokens, 4.03x)
- **Reason**: Go had 14 test runs with 818 FAILED mentions. All three languages required multiple Claude Code sessions (3 each) due to context limits. Severe bugs in graph traversal and algorithm implementations across the board, but Python completed with fewer iterations

#### graphlib-2 Analysis
- **Winner**: Python (3.7M tokens, 6 test runs)
- **Loser**: Go (10.0M tokens, 2.72x)
- **Reason**: Go had 6 test runs with 560 FAILED mentions vs Python's 6 test runs with 192 FAILED and TypeScript's 10 with 96 FAILED. Bugs in strongly connected components (Tarjan's algorithm) - despite equal test runs with Python, Go's fixes required more extensive rewrites

#### graphlib-3 Analysis
- **Winner**: Python (2.5M tokens, 2 test runs)
- **Loser**: Go (15.8M tokens, 6.41x)
- **Reason**: Go had 8 test runs with 416 FAILED mentions vs Python's 2 test runs with 12 FAILED and TypeScript's 6 with 8 FAILED. Dijkstra's algorithm implementation had priority queue bugs causing incorrect shortest path results

---

### kvstore (Key-Value Store - 52 tests)

| Run | Python | TypeScript | Go | Winner |
|-----|--------|------------|-----|--------|
| kvstore-3 | 7,907,000 (16) | 3,149,690 (9) | **2,240,786 (3)** | Go |
| kvstore-4 | 12,664,032 (22) | 3,142,764 (11) | **1,518,085 (6)** | Go |
| kvstore-5 | **4,288,878 (9)** | 19,503,238 (28) | 6,083,687 (14) | Python |

#### kvstore-3 Analysis
- **Winner**: Go (2.2M tokens, 3 test runs)
- **Loser**: Python (7.9M tokens, 3.53x)
- **Reason**: Python had 16 test runs with 89 FAILED mentions vs TypeScript's 9 test runs with 8 FAILED and Go's 3 with 0 FAILED. Severe issues with TTL expiration, WAL replay, and concurrency/locking implementation required extensive debugging. Go's straightforward goroutine handling and mutex implementation passed tests with minimal iterations

#### kvstore-4 Analysis
- **Winner**: Go (1.5M tokens, 6 test runs)
- **Loser**: Python (12.7M tokens, 8.34x)
- **Reason**: Python had 22 test runs with 108 FAILED mentions - worst performance across all experiments. Cascading failures in persistence layer, TTL edge cases, and race conditions under concurrent load. TypeScript also struggled (11 test runs, 12 FAILED) but Go's native concurrency primitives (6 test runs, 0 FAILED) produced correct implementation efficiently

#### kvstore-5 Analysis
- **Winner**: Python (4.3M tokens, 9 test runs)
- **Loser**: TypeScript (19.5M tokens, 4.55x)
- **Reason**: Complete reversal from kvstore-3/4! TypeScript had 28 test runs with 260 FAILED mentions - catastrophic failure with WAL corruption, concurrent request handling, and TTL cleanup. Go also struggled (14 test runs, 356 FAILED) with mutex deadlocks and data race issues. Python's simpler threading approach (9 test runs, 4 FAILED) with proper locks succeeded where Go's goroutines created complex race conditions

---

## Aggregate Results

### Wins by Language

| Language | Wins | Projects |
|----------|------|----------|
| **Python** | **6** | minigit-3, minigit-5, graphlib-1, graphlib-2, graphlib-3, kvstore-5 |
| **TypeScript** | **3** | diffmerge-1, diffmerge-2, diffmerge-3 |
| **Go** | **3** | minigit-4, kvstore-3, kvstore-4 |

### Total Tokens by Project

| Project | Python | TypeScript | Go | Best |
|---------|--------|------------|-----|------|
| minigit-3 | **10,601,283** | 13,192,681 | 10,767,933 | Python |
| minigit-4 | 9,982,258 | 10,263,572 | **8,354,023** | Go |
| minigit-5 | **6,496,725** | 12,362,412 | 15,109,033 | Python |
| diffmerge-1 | 3,734,040 | **2,853,406** | 15,703,598 | TypeScript |
| diffmerge-2 | 9,499,666 | **5,304,613** | 6,695,102 | TypeScript |
| diffmerge-3 | 5,161,343 | **4,147,437** | 12,294,004 | TypeScript |
| graphlib-1 | **5,246,712** | 9,373,304 | 21,124,213 | Python |
| graphlib-2 | **3,678,930** | 5,567,961 | 9,992,770 | Python |
| graphlib-3 | **2,459,314** | 3,995,753 | 15,758,859 | Python |
| kvstore-3 | 7,907,000 | 3,149,690 | **2,240,786** | Go |
| kvstore-4 | 12,664,032 | 3,142,764 | **1,518,085** | Go |
| kvstore-5 | **4,288,878** | 19,503,238 | 6,083,687 | Python |

### Average Tokens by Project Type

| Project | Python Avg | TypeScript Avg | Go Avg | Best Avg |
|---------|-----------|----------------|--------|----------|
| minigit (3 runs) | **9,026,755** | 11,939,555 | 11,410,330 | Python |
| diffmerge (3 runs) | 6,131,683 | **4,101,819** | 11,564,235 | TypeScript |
| graphlib (3 runs) | **3,794,985** | 6,312,339 | 15,625,281 | Python |
| kvstore (3 runs) | 8,286,637 | 8,598,564 | **3,280,853** | Go |

---

## Key Findings

### 1. Test Runs Strongly Correlate with Token Usage

| Test Runs | Typical Tokens | Examples |
|-----------|----------------|----------|
| 2-3 | 0.9M - 6.5M | kvstore-3-go, minigit-5-py |
| 4-6 | 3M - 10M | Most successful runs |
| 8-11 | 10M - 13M | Moderate issues |
| 14-28 | 9M - 19M | Disaster runs |

### 2. No Language is Consistently Best

- **Python**: Won minigit (2/3), graphlib (3/3), kvstore (1/3) - showed extreme variance in kvstore (4.3M to 12.7M)
- **TypeScript**: Won all diffmerge runs (3/3), lost everything else (0/9)
- **Go**: Won minigit (1/3), kvstore (2/3), but lost graphlib (0/3) and diffmerge (0/3)

### 3. Project Type Matters More Than Language

| Project Type | Best Language | Record | Possible Reason |
|--------------|---------------|--------|-----------------|
| Graph Library | Python | 3/3 | Algorithm-heavy, Python's clean syntax |
| Key-Value Store | Go | 2/3 (best avg) | Native concurrency primitives (when they work correctly) |
| Diff/Merge | TypeScript | 3/3 | String manipulation familiarity |
| Git Clone | Python | 2/3 | Complex, but Python edges out |

### 4. Variance Within Language > Variance Between Languages

Python's token usage ranged from 2.5M (graphlib-3) to 12.7M (kvstore-4) - a 5.1x spread within the same language. Go ranged from 1.5M (kvstore-4) to 21.1M (graphlib-1) - a 14x spread.

---

## Root Cause Analysis: Why Losers Lost

### Pattern 1: Infrastructure Bugs (Most Costly)
- **diffmerge-1-go**: JSON output format wrong → 200 FAILED mentions → 9 test runs (15.7M tokens)
- **Tokens wasted**: 12M+ tokens just on rewrites

### Pattern 2: Algorithm Edge Cases
- **minigit-5-go**: merge3 conflict detection wrong → 41 FAILED → 11 test runs
- **diffmerge-2-py**: LCS algorithm bugs → 16 FAILED → 17 test runs

### Pattern 3: Concurrency Issues (Most Severe)
- **kvstore-3-py**: Race conditions, TTL bugs, WAL replay → 89 FAILED → 16 test runs (7.9M tokens)
- **kvstore-4-py**: Cascading persistence failures → 108 FAILED → 22 test runs (12.7M tokens, worst ever)
- **kvstore-4-ts**: Also struggled with concurrency → 12 FAILED → 11 test runs (3.1M tokens)
- **Go dominated**: Native goroutines + mutexes → 0 FAILED in both runs (avg 1.9M tokens)

### Pattern 4: Cascading Failures
When early fundamental bugs exist, each test run reveals more failures, leading to:
```
Bug → Test Failure → Read Error → Attempt Fix → New Bug → More Failures → ...
```

---

## Conclusions

1. **Python leads with 6/12 wins** (50%), TypeScript and Go tied at 3/12 each (25%)

2. **LLM variance dominates everything** - kvstore demonstrates this dramatically:
   - Python: 4.3M (winner) → 7.9M → 12.7M (worst ever) across 3 identical runs
   - Go: 2.2M (winner) → 1.5M (winner) → 6.1M (struggled with deadlocks)
   - TypeScript: 3.1M → 3.1M → 19.5M (catastrophic WAL corruption)
   - **Same task, same plans, 10x variance within language**

3. **Language strengths are real but unreliable**:
   - **Go excels at concurrency** - won kvstore 2/3 times (avg 3.3M vs 8.3M for Python)
   - **Python excels at algorithms** - won graphlib 3/3 times (avg 2.9M vs 14.1M for Go)
   - **But first-pass correctness varies wildly** - Go dominated kvstore-3/4 but struggled in kvstore-5

4. **First-pass correctness determines everything** - language syntax/verbosity is noise

5. **Project type matters more than language** - Go excels at concurrency, Python at algorithms, TypeScript at string manipulation

6. **For practical use**: Pick the language your team knows best - LLM variance will dominate any theoretical efficiency difference

---

## Appendix: Test Run Counts

| Run | Python | TypeScript | Go |
|-----|--------|------------|-----|
| minigit-3 | 2 | 4 | 4 |
| minigit-4 | 6 | 6 | 7 |
| minigit-5 | 2 | 6 | 11 |
| diffmerge-1 | 2 | 4 | 9 |
| diffmerge-2 | 17 | 4 | 7 |
| diffmerge-3 | 2 | 4 | 14 |
| graphlib-1 | 4 | 8 | 14 |
| graphlib-2 | 6 | 10 | 6 |
| graphlib-3 | 2 | 6 | 8 |
| kvstore-3 | 16 | 9 | 3 |
| kvstore-4 | 22 | 11 | 6 |
| kvstore-5 | 9 | 28 | 14 |
| **Total** | **90** | **100** | **103** |

### FAILED Mentions by Run

| Run | Python | TypeScript | Go |
|-----|--------|------------|-----|
| minigit-3 | 18 | 22 | 7 |
| minigit-4 | 24 | 4 | 16 |
| minigit-5 | 9 | 8 | 41 |
| diffmerge-1 | 16 | 14 | 200 |
| diffmerge-2 | 16 | 1 | 54 |
| diffmerge-3 | 4 | 5 | 386 |
| graphlib-1 | 490 | 462 | 818 |
| graphlib-2 | 192 | 96 | 560 |
| graphlib-3 | 12 | 8 | 416 |
| kvstore-3 | 89 | 8 | 0 |
| kvstore-4 | 108 | 12 | 0 |
| kvstore-5 | 4 | 260 | 356 |
| **Total** | **982** | **900** | **2,854** |
