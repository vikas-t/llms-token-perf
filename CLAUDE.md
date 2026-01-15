# Claude Agent Instructions

## 🚨🚨🚨 CRITICAL: TASK TRACKING 🚨🚨🚨

**⚠️ MANDATORY REQUIREMENT - READ THIS FIRST ⚠️**

**THIS PROJECT USES `bd` (BEADS) FOR ***ALL*** TASK TRACKING.**

**❌ NEVER USE TodoWrite - IT IS FORBIDDEN IN THIS PROJECT ❌**

**✅ EVERY SINGLE TASK MUST BE TRACKED WITH `bd` ✅**

**"ALL TASKS" MEANS:**
- ✅ Code implementation tasks
- ✅ Bug fixes
- ✅ Documentation updates
- ✅ Research and investigation
- ✅ Reading files and gathering information
- ✅ ANY user request, no matter how small

---

## bd Workflow (MANDATORY)

**BEFORE doing ANY work, you MUST:**

1. Run `bd create --title="..." --type=task --priority=2` (or `bd ready` to find existing work)
2. Run `bd update <id> --status=in_progress`
3. Do the work
4. Run `bd close <id>`

### Essential Commands
```bash
bd onboard              # First time setup - RUN THIS FIRST
bd ready                # Find available work
bd show <id>            # View issue details
bd create --title="..." --type=task --priority=2  # Create new task
bd update <id> --status=in_progress  # Claim work
bd close <id>           # Complete work
bd sync                 # Sync with git
```

---

## Session Completion (MANDATORY)

When ending any work session, you MUST complete ALL steps:

1. **File issues for remaining work** - Use `bd create` for anything needing follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - `bd close` finished work, update in-progress items
4. **PUSH TO REMOTE** (MANDATORY):
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify** - All changes committed AND pushed

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

---

## ❌ REMINDER: NO TodoWrite ❌

If you find yourself wanting to use TodoWrite - **STOP**. Use bd instead.

```bash
bd create   # Create a new task
bd ready    # What should I work on?
bd close    # I finished something
bd sync     # Keep everything in sync
```

**TodoWrite is FORBIDDEN. Use bd for EVERYTHING.**
