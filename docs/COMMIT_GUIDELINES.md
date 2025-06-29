# 📝 Commit Message Guidelines

## Overview

This project uses **Conventional Commits** specification to ensure consistent, readable, and automated release management. All commits are automatically validated using Lefthook pre-commit hooks.

## 🎯 Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Required Elements

- **type**: The kind of change (see types below)
- **description**: Brief description in imperative mood
- **colon and space**: Must separate type from description

### Optional Elements

- **scope**: Affected area in parentheses
- **!**: Indicates breaking change
- **body**: Detailed explanation (blank line after description)
- **footer**: Breaking changes, issue references

## 📋 Valid Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add user authentication` |
| `fix` | Bug fix | `fix: resolve login timeout issue` |
| `docs` | Documentation changes | `docs: update API documentation` |
| `style` | Code formatting, missing semicolons | `style: fix indentation in auth module` |
| `refactor` | Code refactoring without feature changes | `refactor: extract validation logic` |
| `test` | Adding or modifying tests | `test: add unit tests for user service` |
| `chore` | Build process, dependencies, tooling | `chore: update dependencies` |
| `perf` | Performance improvements | `perf: optimize database queries` |
| `ci` | CI/CD configuration changes | `ci: add performance testing workflow` |
| `build` | Build system changes | `build: configure webpack optimization` |

## ✅ Good Examples

### Basic Commits
```bash
feat: add email notification system
fix: resolve memory leak in auth service
docs: add API endpoint documentation
style: format code according to prettier rules
refactor: extract database connection logic
test: add integration tests for payment flow
chore: update node dependencies to latest
perf: implement caching for user queries
ci: add automated security scanning
build: optimize bundle size configuration
```

### With Scope
```bash
feat(auth): implement OAuth2 integration
fix(dashboard): resolve chart rendering issue
docs(api): update authentication endpoints
style(components): standardize button styling
refactor(utils): simplify date formatting functions
test(auth): add login flow integration tests
chore(deps): update typescript to 5.0
perf(api): add response caching middleware
ci(deploy): configure staging environment
build(webpack): enable code splitting
```

### Breaking Changes
```bash
feat!: redesign authentication system
fix!: change API response structure
feat(api)!: remove deprecated endpoints

# With detailed explanation
feat!: redesign user authentication system

BREAKING CHANGE: The authentication API has been completely redesigned.
- Login endpoint changed from /auth/login to /api/v2/auth/login
- JWT token structure modified
- Password requirements updated

Closes #123
```

### Multi-line Commits
```bash
feat: add advanced search functionality

Implement comprehensive search with filters, sorting, and pagination.
Features include:
- Full-text search across multiple fields
- Date range filtering
- Category-based filtering
- Sort by relevance, date, or title
- Pagination with configurable page size

Closes #456
Refs #789
```

## ❌ Bad Examples

### Invalid Format
```bash
# Missing type
"Add user authentication"

# Missing colon
"feat Add user authentication"

# Invalid type
"feature: add user authentication"

# Description too short
"feat: fix"

# Past tense instead of imperative
"feat: added user authentication"
"fix: fixed login bug"

# Ending with period
"feat: add user authentication."

# Uppercase description start
"feat: Add user authentication"
```

### Unclear Descriptions
```bash
# Too vague
"fix: bug fix"
"feat: improvements"
"chore: updates"

# Not descriptive enough
"fix: issue"
"feat: new stuff"
"docs: changes"
```

## 🔧 Validation Rules

Our Lefthook configuration automatically validates:

### ✅ Format Requirements
- Must follow conventional commit format
- Type must be one of the valid types
- Description must be at least 5 characters
- Proper colon and space separation

### ⚠️ Style Warnings
- Description should start with lowercase (except acronyms)
- Description should not end with period
- Use imperative mood (add, fix, update vs added, fixed, updated)

### ⏭️ Automatic Skips
- Merge commits (`Merge branch 'feature'`)
- Revert commits (`Revert "feat: add feature"`)

## 🧪 Testing Your Commits

### Local Testing
```bash
# Test the validation script manually
echo "feat: add user authentication" | lefthook run commit-msg

# Or test with actual commit
git add .
git commit -m "feat: add user authentication"
```

### Common Validation Scenarios

#### ✅ Valid Commits
```bash
git commit -m "feat: add user dashboard"
git commit -m "fix(auth): resolve token expiration"
git commit -m "docs: update installation guide"
git commit -m "feat!: redesign API structure"
```

#### ❌ Invalid Commits (will be rejected)
```bash
git commit -m "add user dashboard"              # Missing type
git commit -m "feat add user dashboard"         # Missing colon
git commit -m "feature: add user dashboard"     # Invalid type
git commit -m "feat: fix"                       # Too short
git commit -m "feat: added dashboard"           # Past tense
```

## 🚀 Release Impact

Your commit messages directly impact release versioning:

### Major Release (v1.0.0 → v2.0.0)
- Commits with `!` (breaking changes)
- Commits with `BREAKING CHANGE:` in body/footer

### Minor Release (v1.0.0 → v1.1.0)
- Commits starting with `feat:`

### Patch Release (v1.0.0 → v1.0.1)
- All other commit types (`fix:`, `docs:`, `chore:`, etc.)

## 📚 Additional Resources

### Scopes Examples
Use scopes to indicate the area of change:

```bash
# Frontend components
feat(ui): add loading spinner component
fix(form): resolve validation error display

# Backend modules
feat(auth): implement JWT refresh tokens
fix(api): handle database connection errors

# Documentation
docs(readme): add installation instructions
docs(api): update endpoint documentation

# Configuration
chore(deps): update development dependencies
ci(github): add pull request templates
```

### Breaking Changes
Always document breaking changes clearly:

```bash
feat!: update user authentication system

BREAKING CHANGE: 
- Changed login endpoint from /auth/login to /api/v2/auth/login
- Modified user object structure in API responses
- Updated password requirements to include special characters

Migration guide available at docs/MIGRATION.md

Closes #123
```

### Issue References
Link commits to issues and pull requests:

```bash
fix: resolve database connection timeout

Fixes #456
Refs #123, #789
Closes #456
```

## 🛠️ IDE Integration

### VS Code Extensions
- **Conventional Commits**: Auto-complete commit types
- **GitLens**: Enhanced git integration
- **Commitizen**: Interactive commit message creation

### Git Aliases
Add these to your `~/.gitconfig`:

```ini
[alias]
  # Quick conventional commits
  feat = "!f() { git commit -m \"feat: $1\"; }; f"
  fix = "!f() { git commit -m \"fix: $1\"; }; f"
  docs = "!f() { git commit -m \"docs: $1\"; }; f"
  
  # Interactive commit with commitizen
  cz = "!npx git-cz"
```

Usage:
```bash
git feat "add user authentication"
git fix "resolve login timeout"
git docs "update API documentation"
```

## 🔍 Troubleshooting

### Validation Errors

**Error**: "Invalid commit message format!"
```bash
# Check your commit message format
git log --oneline -1
# Fix with amend if needed
git commit --amend -m "feat: correct commit message"
```

**Error**: "Commit description too short!"
```bash
# Make description more descriptive
git commit --amend -m "feat: add comprehensive user authentication system"
```

### Bypassing Validation
Only use in emergencies:
```bash
# Skip validation (NOT RECOMMENDED)
git commit --no-verify -m "emergency fix"

# Better approach: fix the message
git commit -m "fix: resolve critical production issue"
```

### Fixing Commit History
```bash
# Fix last commit message
git commit --amend -m "feat: correct commit message"

# Interactive rebase for multiple commits
git rebase -i HEAD~3
```

## 📞 Getting Help

- **Validation fails**: Check this guide and fix commit message format
- **Unclear on type**: Refer to the types table above
- **Complex changes**: Use multi-line commits with detailed body
- **Breaking changes**: Always use `!` and `BREAKING CHANGE:` footer

Remember: Good commit messages are essential for:
- Automated release notes
- Code review process
- Project maintenance
- Team collaboration
- Future debugging

**Happy committing!** 🎉