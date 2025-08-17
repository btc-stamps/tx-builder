#!/bin/bash
# Simple changelog update helper
# Usage: ./scripts/update-changelog.sh

echo "📝 Generating changelog entries from recent commits..."

# Get the last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")

echo "Changes since $LAST_TAG:"
echo ""

# Generate commit list grouped by type
echo "### Fixed"
git log $LAST_TAG..HEAD --oneline | grep "^[a-f0-9]* fix:" | sed 's/^[a-f0-9]* fix: /- /'

echo ""
echo "### Added"
git log $LAST_TAG..HEAD --oneline | grep "^[a-f0-9]* feat:" | sed 's/^[a-f0-9]* feat: /- /'

echo ""
echo "### Changed"
git log $LAST_TAG..HEAD --oneline | grep "^[a-f0-9]* chore:\|^[a-f0-9]* refactor:" | sed 's/^[a-f0-9]* [a-z]*: /- /'

echo ""
echo "📋 Copy the relevant entries above to CHANGELOG.md"
echo "💡 Remember to:"
echo "  - Group related changes"
echo "  - Write user-facing descriptions"
echo "  - Add comparison links at the bottom"