#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

echo "Running server tests..."
cd "$REPO_ROOT/server"
pytest

echo "Running client tests..."
cd "$REPO_ROOT/client"
npm test -- --watchAll=false

echo "All tests completed."


