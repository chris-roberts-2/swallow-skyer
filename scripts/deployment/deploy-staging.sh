#!/bin/bash

# Deploy to staging environment
set -e

echo "🚀 Deploying to staging environment..."

# Check if required environment variables are set
if [ -z "$STAGING_DEPLOY_KEY" ]; then
    echo "❌ STAGING_DEPLOY_KEY environment variable is required"
    exit 1
fi

# Build frontend
echo "📦 Building frontend..."
cd client
npm run build
cd ..

# Deploy backend
echo "🐍 Deploying backend..."
cd server
# TODO: Add actual deployment commands
echo "Backend deployment commands would go here"
cd ..

echo "✅ Staging deployment completed!"
