package dm

// DiffOp represents the type of diff operation
type DiffOp string

const (
	OpEqual  DiffOp = "equal"
	OpInsert DiffOp = "insert"
	OpDelete DiffOp = "delete"
)

// DiffHunk represents a single diff hunk
type DiffHunk struct {
	Op       DiffOp `json:"op"`
	Content  string `json:"content"`
	OldStart int    `json:"old_start,omitempty"`
	NewStart int    `json:"new_start,omitempty"`
	OldCount int    `json:"old_count,omitempty"`
	NewCount int    `json:"new_count,omitempty"`
}

// DiffStats contains statistics about a diff
type DiffStats struct {
	Additions int `json:"additions"`
	Deletions int `json:"deletions"`
	Changes   int `json:"changes"`
}

// DiffResult contains the result of a diff operation
type DiffResult struct {
	Hunks []DiffHunk `json:"hunks"`
	Stats DiffStats  `json:"stats"`
}

// DiffOptions contains options for diff operations
type DiffOptions struct {
	IgnoreWhitespace  bool `json:"ignore_whitespace"`
	IgnoreBlankLines  bool `json:"ignore_blank_lines"`
	ContextLines      int  `json:"context_lines"`
}

// PatchOptions contains options for patch creation
type PatchOptions struct {
	OldFile      string `json:"old_file"`
	NewFile      string `json:"new_file"`
	ContextLines int    `json:"context_lines"`
}

// PatchLine represents a line in a patch hunk
type PatchLine struct {
	Op      string `json:"op"`
	Content string `json:"content"`
}

// PatchHunk represents a hunk in a parsed patch
type PatchHunk struct {
	OldStart int         `json:"old_start"`
	OldCount int         `json:"old_count"`
	NewStart int         `json:"new_start"`
	NewCount int         `json:"new_count"`
	Lines    []PatchLine `json:"lines"`
}

// ParsedPatch represents a parsed unified diff
type ParsedPatch struct {
	OldFile string      `json:"old_file"`
	NewFile string      `json:"new_file"`
	Hunks   []PatchHunk `json:"hunks"`
}

// ApplyResult contains the result of applying a patch
type ApplyResult struct {
	Content      string   `json:"content"`
	Success      bool     `json:"success"`
	HunksApplied int      `json:"hunks_applied"`
	HunksFailed  int      `json:"hunks_failed"`
	Errors       []string `json:"errors"`
}

// Conflict represents a merge conflict
type Conflict struct {
	Base      string `json:"base"`
	Ours      string `json:"ours"`
	Theirs    string `json:"theirs"`
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
}

// MergeResult contains the result of a three-way merge
type MergeResult struct {
	Content      string     `json:"content"`
	HasConflicts bool       `json:"has_conflicts"`
	Conflicts    []Conflict `json:"conflicts"`
}

// MergeOptions contains options for merge operations
type MergeOptions struct {
	ConflictStyle string `json:"conflict_style"`
	OursLabel     string `json:"ours_label"`
	TheirsLabel   string `json:"theirs_label"`
	BaseLabel     string `json:"base_label"`
}
