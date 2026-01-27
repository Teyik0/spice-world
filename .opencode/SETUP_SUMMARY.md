# OpenCode Setup Summary

## What Was Configured

### Agents Directory (`.opencode/agents/`)
Created 3 specialized agents:

1. **backend-coder.md** - GLM4.7, temp 0.2
   - ElysiaJS API development
   - Atomic transactions & Prisma patterns
   - Ask-by-default for edits/bash
   - Skills: elysiajs

2. **frontend-coder.md** - Kimi K2 Thinking, temp 0.3
   - React/Next.js UI development
   - TanStack Form & shadcn/ui patterns
   - Eden Treaty type-safe API calls
   - Skills: vercel-react-best-practices, frontend-design

3. **planner.md** - GLM4.7, temp 0.1
   - Planning without code changes
   - Can run `bun test` only
   - Can use @explore for codebase searches
   - Tools: read-only (write/edit disabled)

### opencode.json
Added agent configurations and permissions:
- Edit/bash: ask-by-default
- Allowed commands: git diff, git status, bun test, bun run tsc
- Models: GLM4.7 for backend/planner, Kimi K2 Thinking for frontend
- Enhanced build agent with same permissions

### Skills (Already Installed)
- elysiajs (476 lines)
- frontend-design (creative UI principles)
- vercel-react-best-practices (57 optimization rules)
- web-design-guidelines (design compliance)

## How to Use

### 1. Planning Mode (Tab → Plan)
```
@planner "How should I implement bulk delete?"
```
Analyzes code, creates plan, can run tests, but can't edit files.

### 2. Backend Development
```
@backend-coder "Create bulk delete endpoint"
```
- Loads elysiajs skill automatically
- Follows validators → operations → service pattern
- Uses GLM4.7 model (temp 0.2 for consistency)
- Prompts for approval on edits/bash

### 3. Frontend Development
```
@frontend-coder "Add bulk delete UI"
```
- Loads frontend skills automatically
- Reuses backend types via Eden Treaty
- Uses Kimi K2 Thinking (temp 0.3 for creativity)
- Prompts for approval on edits

### Skills Auto-Load
Agents discover skills by description and load when task matches. No manual setup needed!

## Typical Workflow

### Feature Development
```
1. @planner "Add search optimization"
   → Analyzes requirements
   → Creates implementation plan
   → Uses @explore for codebase search

2. User reviews plan

3. @backend-coder "Implement search endpoint"
   → Loads elysiajs skill
   → Follows patterns
   → Prompts before changes

4. @frontend-coder "Create search UI"
   → Loads frontend skills
   → Reuses backend types
   → Prompts before changes

5. @planner "Review implementation"
   → Checks against best practices
   → Can run `bun test` to verify
```

### Bug Investigation
```
1. @planner "Investigate search performance issue"
   → Analyzes code
   → Runs `bun test` if needed

2. @backend-coder "Fix performance issue"
   → Makes changes with approval

3. @planner "Verify fix"
   → Runs tests to confirm
```

## Permissions

### What Runs Without Asking
- git diff
- git status
- bun test
- bun run tsc

### What Requires Approval
- File edits (edit/write/patch)
- All other bash commands

### Why Ask-by-Default
- Complex transactions in codebase
- Prevents accidental production changes
- Allows manual review before destructive ops
- Critical for production systems

## Tab Navigation

- Tab key cycles between agents
- Current mode shown in bottom right
- Plan mode: planner only
- Build mode: full development with enhanced build agent

## Files Created/Modified

1. `.opencode/agents/backend-coder.md` (new)
2. `.opencode/agents/frontend-coder.md` (new)
3. `.opencode/agents/planner.md` (new)
4. `opencode.json` (updated with agents + permissions)

Total: 4 files, ~80 lines of configuration

## Quick Start

1. Run opencode
2. Press Tab to switch to Plan mode
3. Try: `@planner create a plan for adding product categories`
4. Tab back to Build mode
5. Try: `@backend-coder implement the categories endpoint`
6. Try: `@frontend-coder create categories UI`

## Notes

- CLAUDE.md is used as instructions (no AGENTS.md needed)
- Skills auto-discoverable - no configuration required
- Models use GLM4.7 and Kimi K2 Thinking as requested
- All agents have appropriate permissions for their role