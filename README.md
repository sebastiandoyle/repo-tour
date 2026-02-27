# Repo Tour

**Talk to any GitHub repo. Ask questions. Get answers.**

Repo Tour is a Claude Code skill that turns any GitHub repository into an interactive, voice-guided walkthrough. It opens the repo in Chrome, highlights files and code, and has a real-time spoken conversation with you about what everything does.

You can interrupt, ask questions, and navigate the codebase entirely by voice.

## Installation

```bash
curl -sL https://raw.githubusercontent.com/sebastiandoyle/repo-tour/main/install.sh | bash
```

Or manually:

```bash
mkdir -p ~/.claude/commands
curl -sL https://raw.githubusercontent.com/sebastiandoyle/repo-tour/main/repo-tour.md \
  -o ~/.claude/commands/repo-tour.md
```

## Prerequisites

1. **Claude Code** — [Install](https://docs.anthropic.com/en/docs/claude-code)
2. **Puppeteer MCP plugin** — Provides browser control tools. Add to your Claude Code MCP settings.
3. **Chrome open** — The tour runs inside your Chrome browser

## Usage

```
/repo-tour https://github.com/facebook/react
/repo-tour https://github.com/openai/whisper
/repo-tour torvalds/linux
```

Chrome will navigate to the repo. Your microphone activates. The tour begins.

## Voice Commands

| Say this | What happens |
|----------|-------------|
| "What does src do?" | Navigates to src, reads it, explains |
| "Show me package.json" | Opens the file, highlights it |
| "Next" / "Continue" | Advances to the next topic |
| "Go back" | Returns to parent directory |
| "Explain this" | Explains the current page in detail |
| "What's the tech stack?" | Analyzes config files (package.json, Cargo.toml, etc.) |
| "Summarize" | High-level overview of the whole repo |
| *interrupt mid-sentence* | Barge-in — stops narration, listens to you |
| "Stop" / "Bye" | Ends the tour |

## How It Works

```
You: /repo-tour https://github.com/org/repo

Claude Code:
  1. Opens the repo in Chrome (Puppeteer MCP)
  2. Injects a JS engine for voice + visual animations
  3. Requests mic permission
  4. Reads the README to understand the project
  5. Starts a voice conversation loop:
     - Speaks narration through Chrome
     - Listens for your response via microphone
     - Interprets what you said (navigate, explain, highlight...)
     - Executes the action
     - Repeats
```

The voice engine supports:
- **Barge-in** — Interrupt the narration by speaking. Two parallel detectors (AudioContext VAD + Speech Recognition interim results) ensure fast response.
- **Echo cancellation** — Your mic hears you, not the TTS coming through the speakers.
- **Chrome TTS workarounds** — Handles the cancel-bug (80ms delay) and pause-bug (keep-alive timer) automatically.

Visual effects include:
- **Spotlight** — Highlights a file row, blurs everything else
- **Line highlighting** — Yellow highlight on specific code lines
- **Info banners** — Slide-up panels with explanations

## No-Mic Fallback

If you deny microphone access, the tour continues in visual-only mode. Narration plays through speakers, and you type responses in the terminal.

## Troubleshooting

**"I need the Puppeteer MCP plugin"**
Add the Puppeteer MCP server to your Claude Code settings. It provides `puppeteer_navigate`, `puppeteer_evaluate`, and `puppeteer_screenshot` tools.

**Mic permission denied**
Chrome needs microphone access. Check Chrome settings > Privacy > Microphone. The tour falls back to visual-only mode if denied.

**No sound**
Check that Chrome's volume isn't muted. The tour uses Web Speech API (`speechSynthesis`) which respects system audio settings.

**Highlights don't show**
GitHub's UI changes occasionally. The engine handles both the classic and React-based file explorers. If neither works, the tour still functions — just without visual effects.

**Navigation breaks the tour**
This is expected. The JS engine is re-injected after every page navigation automatically.

## License

MIT
