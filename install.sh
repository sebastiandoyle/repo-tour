#!/bin/bash
# Repo Tour — Install script
# Copies the skill file into your Claude Code commands directory

set -e

COMMANDS_DIR="${HOME}/.claude/commands"
SKILL_URL="https://raw.githubusercontent.com/sebastiandoyle/repo-tour/main/repo-tour.md"
DEST="${COMMANDS_DIR}/repo-tour.md"

mkdir -p "$COMMANDS_DIR"

echo "Installing Repo Tour..."
curl -sL "$SKILL_URL" -o "$DEST"

if [ -f "$DEST" ]; then
  echo "Installed to ${DEST}"
  echo ""
  echo "Usage: /repo-tour https://github.com/any/repo"
  echo ""
  echo "Prerequisites:"
  echo "  - Claude Code with Puppeteer MCP plugin"
  echo "  - Chrome open"
else
  echo "Installation failed. Try manually:"
  echo "  curl -sL ${SKILL_URL} -o ${DEST}"
  exit 1
fi
