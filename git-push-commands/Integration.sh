#!/bin/bash
# WARNING: Do not delete or move this script. Essential for Integration branch Git operations.

# Swallow Skyer - Integration Branch Push Commands
# This script contains commands to commit and push changes to the Integration branch (active development)

echo "=== Swallow Skyer - Integration Branch Push Commands ==="
echo ""

# Check current branch
echo "1. Checking current branch..."
git branch

# Switch to Integration branch
echo "2. Switching to Integration branch..."
git checkout Integration

# Pull latest changes from remote
echo "3. Pulling latest changes from remote..."
git pull origin Integration

# Add all changes
echo "4. Adding all changes..."
git add .

# Commit with descriptive message
echo "5. Committing changes..."
git commit -m "feat(photos): Supabase/R2 photo pipeline, /api/photos, presigned URLs, tests, frontend MapLibre example, path alignment, upload schema updates"

# Push to foundation branch
echo "6. Pushing to Integration branch..."
git push origin Integration

echo ""
echo "=== Push to foundation branch completed! ==="
echo ""

# Optional: Show status
echo "7. Final status check..."
git status
