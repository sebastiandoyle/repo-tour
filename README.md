# Repo Tour

**Talk to any GitHub repo. Voice-guided code walkthroughs powered by Claude Code.**

Repo Tour is a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that turns any GitHub repository into an interactive, voice-guided walkthrough. It opens the repo in your browser, highlights files and code lines, and has a real-time spoken conversation with you about what everything does.

You speak. It speaks back. You can interrupt mid-sentence. It navigates, highlights, and explains — all by voice.

## Quick Install

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

| Requirement | Why |
|-------------|-----|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | The AI that runs the tour |
| [Puppeteer MCP](https://github.com/anthropics/claude-code/blob/main/MCP.md) | Browser control (navigate, click, inject JS) |
| Chrome open | The tour runs inside your browser |

## Usage

```
/repo-tour https://github.com/facebook/react
/repo-tour https://github.com/openai/whisper
/repo-tour torvalds/linux
```

Chrome navigates to the repo. Your microphone activates. The tour begins.

## What You Can Say

| Voice command | What happens |
|---------------|-------------|
| *"What does src do?"* | Navigates to `src/`, reads it, explains |
| *"Show me package.json"* | Opens the file, highlights it |
| *"Next"* / *"Continue"* | Advances to the next topic |
| *"Go back"* | Returns to parent directory |
| *"Explain this"* | Explains the current page in detail |
| *"What's the tech stack?"* | Analyzes config files |
| *"Highlight lines 10 to 25"* | Yellow-highlights those code lines |
| *"Summarize"* | High-level overview of the whole repo |
| *(interrupt mid-sentence)* | Barge-in — stops narration, listens to you |
| *"Stop"* / *"Bye"* | Ends the tour |

## How It Works

```
You: /repo-tour https://github.com/org/repo

Claude Code:
  1. Opens the repo in Chrome via Puppeteer
  2. Injects a voice + animation engine (engine.js)
  3. Requests mic permission
  4. Reads the README to understand the project
  5. Starts a voice conversation loop:
     speak → listen → interpret → navigate/highlight → repeat
```

### Voice Engine

The JS engine (`engine.js`) handles everything in-browser:

- **Barge-in** — Interrupt the AI mid-sentence. Two parallel detectors (AudioContext VAD + Speech Recognition interim results) ensure ~100ms response time.
- **Echo cancellation** — Your mic hears you, not the TTS coming through speakers.
- **Chrome TTS workarounds** — Handles the cancel-bug (80ms delay) and pause-bug (keep-alive timer) automatically.

### Visual Effects

- **Spotlight** — Highlights a file row with a blue pulse, blurs everything else
- **Line highlighting** — Yellow highlight on specific code lines with auto-scroll
- **Info banners** — Slide-up dark panels at the bottom of the screen

### No-Mic Fallback

If mic access is denied, the tour continues in visual-only mode. Narration plays through speakers, and you type responses in the terminal.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| *"I need the Puppeteer MCP plugin"* | Add Puppeteer MCP server to Claude Code settings |
| Mic permission denied | Check Chrome settings > Privacy > Microphone |
| No sound | Check Chrome volume isn't muted (uses Web Speech API) |
| Highlights missing | GitHub UI may have changed; tour still works without visuals |
| Tour breaks on navigation | Expected — engine auto-re-injects after every page change |

## License

MIT
