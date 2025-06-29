#!/usr/bin/env bash

# Standalone commit message validation script
# Usage: ./scripts/validate-commit.sh "commit message"
# or: ./scripts/validate-commit.sh < commit_msg_file

set -euo pipefail

# Function to validate commit message
validate_commit_message() {
    local commit_msg="$1"
    local first_line

    # Get first line and clean it
    first_line=$(printf '%s\n' "$commit_msg" | head -n1 | tr -d '\r' | xargs)

    # Skip empty commit messages
    if [ -z "$first_line" ]; then
        echo "❌ Empty commit message"
        return 1
    fi

    echo "🔍 Validating commit message: $first_line"

    # Skip validation for merge and revert commits
    case "$first_line" in
        "Merge "*)
            echo "⏭️ Skipping validation for merge commit"
            return 0
            ;;
        "Revert "*)
            echo "⏭️ Skipping validation for revert commit"
            return 0
            ;;
    esac

    # Check conventional commit format
    if ! printf '%s\n' "$first_line" | grep -qE '^(feat|fix|docs|style|refactor|test|chore|perf|ci|build)(\([^)]+\))?!?: .+'; then
        echo ""
        echo "❌ Invalid commit message format!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Expected format: type(scope): description"
        echo ""
        echo "📝 Valid types:"
        echo "   feat, fix, docs, style, refactor, test, chore, perf, ci, build"
        echo ""
        echo "💡 Examples:"
        echo "   feat: add user authentication system"
        echo "   fix(auth): resolve login timeout issue"
        echo "   docs: update API documentation"
        echo ""
        echo "🚫 Your commit message: '$first_line'"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        return 1
    fi

    # Extract description after the colon
    local description
    description=$(printf '%s\n' "$first_line" | sed 's/^[^:]*: *//')

    # Check minimum description length
    if [ ${#description} -lt 5 ]; then
        echo ""
        echo "❌ Commit description too short!"
        echo "Description must be at least 5 characters long"
        echo "Your description: '$description' (${#description} characters)"
        return 1
    fi

    # Success message
    echo "✅ Commit message is valid!"

    local type
    type=$(printf '%s\n' "$first_line" | sed -E 's/^([^(:!]+).*$/\1/')
    echo "   Type: $type"

    if printf '%s\n' "$first_line" | grep -q '!:'; then
        echo "   ⚠️  Breaking change detected"
    fi

    if printf '%s\n' "$first_line" | grep -qE '\([^)]+\)'; then
        local scope
        scope=$(printf '%s\n' "$first_line" | sed -E 's/^[^(]+\(([^)]+)\).*$/\1/')
        echo "   Scope: $scope"
    fi

    echo "   Description: $description"
    return 0
}

# Main execution
main() {
    local commit_msg=""

    if [ $# -eq 0 ]; then
        # Read from stdin if no arguments
        if [ -t 0 ]; then
            echo "Usage: $0 \"commit message\""
            echo "   or: echo \"commit message\" | $0"
            echo "   or: $0 < commit_msg_file"
            exit 1
        fi
        commit_msg=$(cat)
    elif [ $# -eq 1 ]; then
        if [ -f "$1" ]; then
            # Read from file if argument is a file
            commit_msg=$(cat "$1")
        else
            # Treat argument as commit message
            commit_msg="$1"
        fi
    else
        echo "Error: Too many arguments"
        echo "Usage: $0 \"commit message\""
        exit 1
    fi

    validate_commit_message "$commit_msg"
}

# Run main function with all arguments
main "$@"
