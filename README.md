# cursor-claw

A full-featured starter kit for running a personal AI ops agent powered by **Cursor**. Includes Discord integration via MCP, a cron scheduler, persistent memory, and structured workspace rules — everything you need to go from a fresh Cursor install to a running personal agent.

## What you get

- **Cursor-native agent setup** — workspace rules, AGENTS.md identity file, and MCP configuration wired up out of the box
- **Discord integration** — your agent listens and replies in your Discord server via the [fleet-discord](https://github.com/Agent-Crafting-Table/fleet-discord) MCP plugin
- **Cron scheduler** — schedule tasks as natural language prompts; a lightweight Node.js runner fires them on schedule via `cursor --headless`
- **Persistent memory** — structured markdown memory system your agent writes to and reads from across sessions
- **Background agent support** — designed for Cursor's background agent mode so tasks run without blocking your editor

## Prerequisites

- [Cursor](https://cursor.com) installed (latest version)
- A Claude Max or Cursor Pro subscription
- A Discord bot token and application ID ([create one here](https://discord.com/developers/applications))
- Node.js 18+ (for the cron runner and Discord scripts)

## Quick start

```bash
git clone https://github.com/Agent-Crafting-Table/cursor-claw
cd cursor-claw
cp config/.env.example config/.env
# Edit config/.env with your tokens
npm install
```

Open the `cursor-claw` folder in Cursor — the workspace rules and MCP config load automatically.

Register your Discord slash commands:

```bash
node scripts/discord-slash-register.js
```

Start the cron runner (in a terminal or as a system service):

```bash
node scripts/cron-runner.js
```

## Architecture

```
cursor-claw/
├── .cursor/
│   ├── mcp.json            # MCP server config — Discord integration
│   └── rules/
│       └── AGENTS.md       # Agent identity, behaviors, and session init
├── config/
│   └── .env.example        # All required environment variables
├── scripts/
│   ├── cron-runner.js      # Reads crons/jobs.json, fires jobs on schedule
│   ├── discord-slash-handler.js  # Handles Discord slash commands
│   ├── discord-slash-register.js # Registers slash commands with Discord
│   └── discord-post.js     # Utility — posts a message to a Discord channel
├── crons/
│   ├── jobs.json           # Cron job definitions
│   └── logs/               # Per-job log output
├── memory/
│   ├── AGENT.md            # Your agent's identity (loaded every session)
│   └── active-threads.md   # What's currently in flight
└── data/                   # Runtime state (model selection, etc.)
```

## MCP / Discord setup

The `.cursor/mcp.json` file configures the [fleet-discord](https://github.com/Agent-Crafting-Table/fleet-discord) MCP plugin. Cursor loads this automatically when you open the workspace.

Edit `.cursor/mcp.json` and set your Discord credentials, then reload Cursor. Your agent will be able to read and post to Discord channels as MCP tools.

You can also use the lighter [discord-streaming](https://github.com/Agent-Crafting-Table/discord-streaming) plugin if you don't need multi-agent fleet routing — just swap the server path in `mcp.json`.

## Workspace rules

The `.cursor/rules/AGENTS.md` file is loaded by the Cursor agent at the start of every session. It defines:

- Your agent's identity and role
- Session initialization steps (read memory, check threads)
- Behavioral guidelines
- Available tools and access paths

Customize this file to match your use case.

## Identity layer

Your agent's personality and context live in six files at the workspace root. Fill these in before your first run — they're loaded every session and shape everything your agent does.

| File | Purpose |
|------|---------|
| `SOUL.md` | Core personality, values, communication style, boundaries |
| `IDENTITY.md` | Name, role, vibe, emoji |
| `USER.md` | About you — name, preferences, context |
| `TOOLS.md` | Your specific setup — servers, channels, repos, services |
| `HEARTBEAT.md` | What to check during scheduled proactive runs |
| `MEMORY.md` | Long-term memory index (keep under 40 lines; details go in `memory/references/`) |

Each file ships as a blank template. Fill them in, commit them, and your agent reads itself into being every session.

**Rule of thumb:**
- Who the agent *is* → `SOUL.md`
- How the agent *presents* → `IDENTITY.md`
- Who *you* are → `USER.md`
- How to *operate* → `.cursor/rules/AGENTS.md`
- What tools/infra exist → `TOOLS.md`
- What to check proactively → `HEARTBEAT.md`

## Configuration

### `config/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_GUILD_ID` | Yes | Your Discord server ID |
| `DISCORD_CHANNEL_ID` | Yes | Default channel for agent replies |
| `AGENT_TIMEZONE` | No | Cron timezone (default: `UTC`) |

### Customizing your agent

Edit `.cursor/rules/AGENTS.md` (and `memory/AGENT.md`) to define your agent's identity, behaviors, and session init instructions. These files are read at the start of every Cursor agent session.

### Adding cron jobs

Edit `crons/jobs.json`. Each job is a natural language prompt executed on schedule:

```json
{
  "id": "my-daily-summary",
  "name": "Daily Summary",
  "enabled": true,
  "schedule": "0 9 * * *",
  "tz": "UTC",
  "timeoutSeconds": 120,
  "message": "Post a brief daily summary to Discord channel 123456789."
}
```

The cron runner fires each job by sending the prompt to your agent. For Cursor-based execution, set `"runner": "cursor"` on the job (see `jobs.json` comments).

## Running the cron scheduler

The cron runner is a lightweight Node.js process that reads `crons/jobs.json` and fires jobs on schedule.

```bash
# Foreground (development):
node scripts/cron-runner.js

# As a background service (systemd example):
# See docs/systemd-service.md
```

## Discord slash commands

Register commands once after setup:

```bash
node scripts/discord-slash-register.js
```

| Command | Description |
|---------|-------------|
| `/status` | Health check — memory, active threads, recent activity |
| `/agent <message>` | Send an arbitrary prompt to your agent |
| `/cron list` | List enabled cron jobs |
| `/cron run <id>` | Manually trigger a cron job |

## Memory system

Your agent reads from and writes to the `memory/` directory to maintain context across sessions:

| File | Purpose |
|------|---------|
| `memory/AGENT.md` | Identity and session init instructions |
| `memory/active-threads.md` | Currently in-flight tasks (max 30 lines) |
| `memory/YYYY-MM-DD.md` | Daily notes — written immediately after actions |
| `memory/references/<topic>.md` | Durable knowledge by topic |

The agent is instructed (via `AGENTS.md`) to write daily notes immediately after significant actions, not at the end of the session.

## Related repos

These smaller Agent-Crafting-Table libraries are used as building blocks:

- [fleet-discord](https://github.com/Agent-Crafting-Table/fleet-discord) — Discord MCP plugin (multi-agent routing)
- [discord-streaming](https://github.com/Agent-Crafting-Table/discord-streaming) — Lightweight Discord plugin with live status updates
- [mcp-self-reload](https://github.com/Agent-Crafting-Table/mcp-self-reload) — MCP server restart-loop pattern
- [evolution-loop](https://github.com/Agent-Crafting-Table/evolution-loop) — Agent self-improvement via Reflexion diffs

## License

MIT
