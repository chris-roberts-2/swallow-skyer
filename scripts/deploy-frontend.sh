#!/bin/bash
set -e

# Deploy frontend to GitHub Pages (website-v1 branch)
# This script prevents .env file loss during deployment

echo "=== Swallow Skyer Frontend Deployment ==="
echo ""

# Check we're on an allowed branch (main or v1.1-UI)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "v1.1-UI" ]; then
  echo "❌ Error: Must be on 'main' or 'v1.1-UI' branch before deploying"
  echo "   Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  Warning: You have uncommitted changes"
  echo "   Commit or stash them before deploying"
  git status --short
  exit 1
fi

# Check if .env.local exists
if [ ! -f "client/.env.local" ]; then
  echo "❌ Error: client/.env.local not found!"
  echo ""
  echo "You must create client/.env.local with your API keys before building."
  echo "Copy from template: cp client/env.example client/.env.local"
  echo "Then edit client/.env.local with your actual values."
  exit 1
fi

echo "✅ On $CURRENT_BRANCH branch with no uncommitted changes"
echo "✅ Found client/.env.local"
echo ""

# Build frontend
echo "📦 Building frontend..."
cd client
npm ci
npm run build
cd ..
echo "✅ Build complete"
echo ""

# Backup build output
echo "💾 Backing up build output..."
rm -rf /tmp/swallow-build
mkdir -p /tmp/swallow-build
cp -R "client/build/." /tmp/swallow-build/
echo "✅ Build backed up to /tmp/swallow-build"
echo ""

# Backup .env files
echo "💾 Backing up .env files..."
mkdir -p /tmp/swallow-env-backup
[ -f "client/.env.local" ] && cp client/.env.local /tmp/swallow-env-backup/ && echo "   ✓ client/.env.local"
[ -f "client/.env" ] && cp client/.env /tmp/swallow-env-backup/ && echo "   ✓ client/.env"
[ -f "server/.env" ] && cp server/.env /tmp/swallow-env-backup/ && echo "   ✓ server/.env"
echo "✅ .env files backed up"
echo ""

# Switch to website-v1 branch
echo "🔀 Switching to website-v1 branch..."
git checkout website-v1

# Clear and copy build
echo "📁 Replacing branch contents with build output..."
rm -rf ./*
cp -R /tmp/swallow-build/. .

# Commit and push
echo "📤 Committing and pushing to GitHub Pages..."
git add -A

# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
  echo "ℹ️  No changes to deploy"
else
  git commit -m "Deploy frontend build - $(date '+%Y-%m-%d %H:%M:%S')"
  git push origin website-v1
  echo "✅ Deployed to GitHub Pages"
fi
echo ""

# Return to original branch
echo "🔀 Returning to $CURRENT_BRANCH branch..."
git checkout "$CURRENT_BRANCH"

# Restore .env files
echo "📥 Restoring .env files..."
[ -f "/tmp/swallow-env-backup/.env.local" ] && cp /tmp/swallow-env-backup/.env.local client/ && echo "   ✓ client/.env.local"
[ -f "/tmp/swallow-env-backup/.env" ] && cp /tmp/swallow-env-backup/.env client/ && echo "   ✓ client/.env"
[ -f "/tmp/swallow-env-backup/.env" ] && cp /tmp/swallow-env-backup/.env server/ && echo "   ✓ server/.env"
echo "✅ .env files restored"
echo ""

echo "🎉 Deployment complete!"
echo ""
echo "Your frontend is now live at: https://chris-roberts-2.github.io/swallow-skyer/"
