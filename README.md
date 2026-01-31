# opencode-claude-code-provider

An OpenCode plugin that registers Claude Code (Agent SDK) as a provider, allowing users to use their existing `claude login` subscription without API keys.

## Features

- **No API Key Required**: Uses your existing Claude Code CLI authentication (`claude login`)
- **Flat-Rate Pricing**: Costs are zeroed out since you're using your subscription
- **Three Models Available**:
  - `claude-code/sonnet` - Fast and capable
  - `claude-code/opus` - Most powerful
  - `claude-code/haiku` - Fastest, most cost-effective
- **Built-in Tool**: Includes `claude-code-query` tool for explicit Agent SDK calls

## Prerequisites

1. You must have [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/installation) installed and authenticated:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login
   ```

2. OpenCode must be installed (the plugin will be loaded by OpenCode)

## Installation

### Method 1: Symlink for Development

```bash
# Clone the repository
git clone <repository-url>
cd opencode-claude-code-provider

# Install dependencies
bun install

# Build the plugin
bun run build

# Symlink to OpenCode plugins directory
ln -s $(pwd) ~/.config/opencode/plugins/opencode-claude-code-provider
```

### Method 2: Copy to Plugins Directory

```bash
# Build the plugin
bun run build

# Copy to OpenCode plugins directory
cp -r dist ~/.config/opencode/plugins/opencode-claude-code-provider
```

## Usage

Once installed, OpenCode will automatically detect the plugin. You can select Claude Code models in your OpenCode configuration:

```json
{
  "model": "claude-code/sonnet"
}
```

Or use the explicit query tool:

```json
{
  "tool": "claude-code-query",
  "args": {
    "model": "opus",
    "prompt": "Your prompt here"
  }
}
```

## How It Works

This plugin uses:
- [`ai-sdk-provider-claude-code`](https://github.com/ben-vargas/ai-sdk-provider-claude-code) - Wraps the Claude Agent SDK for Vercel AI SDK compatibility
- `@anthropic-ai/claude-agent-sdk` - The official Claude Code SDK

The plugin registers `claude-code` as a provider and zeros out cost tracking since you're using your flat-rate Claude Code subscription rather than per-token API pricing.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode for development
bun run dev
```

## License

MIT
