#!/bin/bash
# WARNING: Do not delete or move this script. Essential for foundation branch Git operations.

# Swallow Skyer - Main Branch Push Commands
# This script contains commands to commit and push changes to the main branch

echo "=== Swallow Skyer - Main Branch Push Commands ==="
echo ""

# Check current branch
echo "1. Checking current branch..."
git branch

# Switch to main branch
echo "2. Switching to main branch..."
git checkout main

# Pull latest changes from remote
echo "3. Pulling latest changes from remote..."
git pull origin main

# Add all changes
echo "4. Adding all changes..."
git add .

# Commit with descriptive message
echo "5. Committing changes..."
git commit -m "feat: add foundational file structure for map-based photo platform"

# Push to main branch
echo "6. Pushing to main branch..."
git push origin main

echo ""
echo "=== Push to main branch completed! ==="
echo ""

# Optional: Show status
echo "7. Final status check..."
git status
