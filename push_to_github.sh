#!/bin/bash
# CallWave - Push to GitHub helper
# 1. Create repo at https://github.com/new (DO NOT init with README)
# 2. Replace USERNAME and REPO below, then run: chmod +x push_to_github.sh && ./push_to_github.sh

set -e

# --- EDIT THESE TWO LINES ---
GITHUB_USERNAME="YOUR_GITHUB_USERNAME"
REPO_NAME="callwave-hd-voice"
# ----------------------------

if [ "$GITHUB_USERNAME" = "YOUR_GITHUB_USERNAME" ]; then
  echo "⚠️  Please edit this file and set GITHUB_USERNAME and REPO_NAME"
  echo "   nano push_to_github.sh"
  exit 1
fi

REMOTE_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo "🚀 Pushing CallWave to $REMOTE_URL"

# Add remote if not exists
if git remote | grep -q origin; then
  echo "Remote origin exists, updating..."
  git remote set-url origin $REMOTE_URL
else
  git remote add origin $REMOTE_URL
fi

git branch -M main
git push -u origin main

echo "✅ Done! Repo now on GitHub: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
echo "   Clone anywhere with: git clone $REMOTE_URL"
