#!/bin/bash
# WARNING: Do not delete or move this script. Essential for Interaction branch Git operations.

# Skyer - Interaction Branch Push Commands
# This script commits and pushes changes to the Interaction branch (active development/testing)

set -e

echo "=== Skyer - Interaction Branch Push Commands ==="
echo ""

# Check current branch
echo "1. Checking current branch..."
git branch

# Switch to Interaction branch (create local tracking branch if needed)
echo "2. Switching to Interaction branch..."
git fetch origin
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "   Detected local changes. Stashing before checkout..."
  git stash push -u -m "auto-stash before switching to Interaction"
  STASHED=1
fi

git checkout -B Interaction origin/Interaction

# Pull latest changes from remote
echo "3. Pulling latest changes from remote..."
git pull --ff-only

# Re-apply stashed changes if we had any
if [ $STASHED -eq 1 ]; then
  echo "   Re-applying stashed changes..."
  git stash pop || true
fi

# Add all changes
echo "4. Adding all changes..."
git add .

# Commit with provided message or a sensible default
COMMIT_MSG=${1:-"chore(interaction): push local changes"}
echo "5. Committing changes..."
git commit -m "$COMMIT_MSG" || echo "No changes to commit. Proceeding..."

# Push to Interaction branch
echo "6. Pushing to Interaction branch..."
git push origin Interaction

echo ""
echo "=== Push to Interaction branch completed! ==="
echo ""

# Optional: Show status
echo "7. Final status check..."
git status
