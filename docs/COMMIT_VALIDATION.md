# Commit Message Validation

This project uses automated commit message validation to ensure consistent and meaningful commit messages following conventional commit standards.

## Overview

The validation is implemented using [lefthook](https://github.com/evilmartians/lefthook) and runs automatically on every commit via a `commit-msg` git hook.

## Validation Rules

### Format Requirements

All commit messages must follow the conventional commit format:

```
type(scope): description
```

- **type**: Required. Must be one of:
  - `feat` - A new feature
  - `fix` - A bug fix
  - `docs` - Documentation only changes
  - `style` - Code style changes (formatting, etc.)
  - `refactor` - Code refactoring
  - `test` - Adding or fixing tests
  - `chore` - Build process or auxiliary tool changes
  - `perf` - Performance improvements
  - `ci` - CI configuration changes
  - `build` - Build system changes

- **scope**: Optional. Describes the area of the codebase affected (e.g., `auth`, `api`, `ui`)

- **description**: Required. Must be at least 5 characters long

### Breaking Changes

For breaking changes, add `!` before the colon:

```
feat!: redesign user authentication system
fix(api)!: change response format for user endpoints
```

## Examples

### Valid Commit Messages

```bash
feat: add user authentication system
fix(auth): resolve login timeout issue
docs: update API documentation
style(ui): improve button spacing
refactor: extract utility functions
test: add unit tests for user service
chore: update dependencies
perf(db): optimize user queries
ci: add automated testing workflow
build: configure webpack for production
feat(dashboard): add real-time notifications
fix!: change API response format (breaking change)
```

### Invalid Commit Messages

```bash
# Missing type
"add user authentication"

# Invalid type
"feature: add authentication"

# Missing description
"feat:"

# Description too short
"feat: add"

# Wrong format
"Added user authentication system"
```

## Special Cases

The following commit types are automatically skipped during validation:

- **Merge commits**: Messages starting with "Merge "
- **Revert commits**: Messages starting with "Revert "

## Testing Validation

### Using the Standalone Script

You can test commit messages before committing using the standalone validation script:

```bash
# Test a commit message directly
./scripts/validate-commit.sh "feat: add user authentication"

# Test from a file
echo "fix(auth): resolve timeout issue" | ./scripts/validate-commit.sh

# Test from a commit message file
./scripts/validate-commit.sh path/to/commit_msg_file
```

### Manual Testing

```bash
# This will trigger validation
git commit -m "feat: your commit message here"

# This will fail validation
git commit -m "invalid message format"
```

## Implementation Details

### Files

- `lefthook.yml` - Main lefthook configuration with commit-msg hook
- `scripts/validate-commit.sh` - Standalone validation script for testing
- `.git/hooks/commit-msg` - Auto-generated git hook (created by lefthook)

### Hook Configuration

The commit-msg hook in `lefthook.yml`:

```yaml
commit-msg:
  jobs:
    - name: conventional commit validation
      run: ./scripts/validate-commit.sh {1}
```

The `{1}` parameter passes the commit message file path to the validation script.

### Installation

Lefthook hooks are automatically installed when you run:

```bash
bunx lefthook install
```

This creates the necessary git hooks in `.git/hooks/`.

## Troubleshooting

### Hook Not Running

If the commit-msg validation isn't running:

1. Ensure lefthook is installed:
   ```bash
   bunx lefthook install
   ```

2. Check that the validation script is executable:
   ```bash
   chmod +x scripts/validate-commit.sh
   ```

3. Verify the git hooks directory:
   ```bash
   ls -la .git/hooks/
   ```

### Validation Script Issues

If the validation script fails:

1. Test it directly:
   ```bash
   ./scripts/validate-commit.sh "feat: test message"
   ```

2. Check script permissions:
   ```bash
   ls -la scripts/validate-commit.sh
   ```

3. Ensure the script has Unix line endings (not Windows CRLF)

### Bypassing Validation (Not Recommended)

In emergency situations, you can bypass commit validation using:

```bash
git commit --no-verify -m "emergency fix"
```

However, this should be used sparingly and the commit message should be amended later to follow the proper format.

## Benefits

- **Consistency**: All commits follow the same format
- **Clarity**: Commit messages clearly indicate the type and scope of changes
- **Automation**: Automatic changelog generation and semantic versioning
- **Team Collaboration**: Easier to understand project history and changes
- **CI/CD Integration**: Commit types can trigger different deployment workflows

## Integration with Tools

This validation setup integrates well with:

- **Semantic Release**: Automatically determines version bumps based on commit types
- **Conventional Changelog**: Generates changelogs from commit messages
- **GitHub Actions**: Can trigger different workflows based on commit types
- **Code Review**: Reviewers can quickly understand the nature of changes