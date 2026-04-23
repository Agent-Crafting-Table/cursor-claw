#!/usr/bin/env node
/**
 * discord-slash-handler.js — Handle Discord slash command interactions.
 *
 * Runs as a persistent process alongside the cron runner.
 * Listens for interactionCreate events via discord.js gateway.
 *
 * Supported commands:
 *   /status            — run a quick system status check
 *   /model [name]      — show or set the active Claude model
 *   /herc <message>    — send an arbitrary message to your agent via claude -p
 *   /cron list         — list enabled cron jobs
 *   /cron run <id>     — manually trigger a cron job
 *   /cron logs <id>    — tail the log for a cron job
 *
 * Usage:
 *   node scripts/discord-slash-handler.js
 *
 * Environment:
 *   DISCORD_BOT_TOKEN, DISCORD_APP_ID, WORKSPACE_DIR
 */

'use strict';

const { Client, GatewayIntentBits } = require('discord.js');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE_DIR || '/workspace';
const MODEL_STATE_FILE = path.join(WORKSPACE, 'data', 'current-model.json');
const JOBS_FILE = path.join(WORKSPACE, 'crons', 'jobs.json');
const CRON_LOGS_DIR = path.join(WORKSPACE, 'crons', 'logs');

const MODEL_ALIASES = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function readCurrentModel() {
  try {
    return JSON.parse(fs.readFileSync(MODEL_STATE_FILE, 'utf8')).model || 'sonnet';
  } catch {
    return 'sonnet';
  }
}

function setModel(alias) {
  const model = alias in MODEL_ALIASES ? alias : 'sonnet';
  fs.mkdirSync(path.dirname(MODEL_STATE_FILE), { recursive: true });
  fs.writeFileSync(MODEL_STATE_FILE, JSON.stringify({ model, updatedAt: new Date().toISOString() }));
  return model;
}

/**
 * Kill the interactive Claude process so restart-loop.sh relaunches with the new model.
 * Finds bash /restart-loop.sh by exact cmdline match and kills its child (the claude process).
 */
function restartClaudeSession() {
  try {
    const loopPid = execFileSync('pgrep', ['-fx', 'bash /restart-loop.sh'], { timeout: 3000 })
      .toString().trim().split('\n')[0];
    if (loopPid) {
      execFileSync('pkill', ['-P', loopPid], { timeout: 3000 });
      return true;
    }
  } catch {}
  // Fallback: send /exit via tmux
  try {
    execFileSync('tmux', ['send-keys', '-t', 'claude:0', '/exit', 'Enter'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function runClaude(prompt, model = null) {
  const activeModel = model || readCurrentModel();
  const fullModel = MODEL_ALIASES[activeModel] || MODEL_ALIASES.sonnet;
  return new Promise((resolve) => {
    let output = '';
    const proc = spawn('claude', [
      '--dangerously-skip-permissions',
      '--model', fullModel,
      '-p', prompt,
    ], { env: process.env });

    proc.stdout.on('data', d => { output += d; });
    proc.stderr.on('data', d => console.error('[claude stderr]', d.toString()));

    const timer = setTimeout(() => { proc.kill(); resolve(output || '(timed out)'); }, 120000);
    proc.on('close', () => { clearTimeout(timer); resolve(output.trim() || '(no output)'); });
    proc.on('error', e => { clearTimeout(timer); resolve(`[error: ${e.message}]`); });
  });
}

function truncate(str, max = 1900) {
  return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  console.log(`[slash] /${commandName} from ${interaction.user.tag}`);
  await interaction.deferReply();

  try {
    if (commandName === 'status') {
      const result = await runClaude(
        'Run a quick system status check: report memory usage, list any recent errors ' +
        'from memory/errors.md if it exists, and confirm cron runner is healthy. ' +
        'Keep the response under 300 words.'
      );
      await interaction.editReply(truncate(result));

    } else if (commandName === 'model') {
      const name = interaction.options.getString('name');
      if (!name) {
        const current = readCurrentModel();
        await interaction.editReply(`Current model: **${current}** (${MODEL_ALIASES[current] || current})`);
      } else if (!(name in MODEL_ALIASES)) {
        await interaction.editReply(`Unknown model. Available: ${Object.keys(MODEL_ALIASES).join(', ')}`);
      } else {
        setModel(name);
        restartClaudeSession();
        await interaction.editReply(`Model set to **${name}** (${MODEL_ALIASES[name]}). Session restarting...`);
      }

    } else if (commandName === 'herc') {
      const message = interaction.options.getString('message');
      const result = await runClaude(message);
      await interaction.editReply(truncate(result));

    } else if (commandName === 'cron') {
      const sub = interaction.options.getSubcommand();
      let jobs = [];
      try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).jobs || []; } catch {}

      if (sub === 'list') {
        const enabled = jobs.filter(j => j.enabled);
        if (!enabled.length) {
          await interaction.editReply('No enabled cron jobs.');
        } else {
          const lines = enabled.map(j => `• **${j.id}** — ${j.name} \`${j.schedule}\``);
          await interaction.editReply(truncate(lines.join('\n')));
        }

      } else if (sub === 'run') {
        const id = interaction.options.getString('id');
        const job = jobs.find(j => j.id === id);
        if (!job) {
          await interaction.editReply(`Job not found: \`${id}\``);
        } else {
          await interaction.editReply(`Running **${job.name}**...`);
          runClaude(job.message, job.model || 'sonnet').then(result => {
            interaction.followUp(truncate(result)).catch(() => {});
          });
        }

      } else if (sub === 'logs') {
        const id = interaction.options.getString('id');
        const logFile = path.join(CRON_LOGS_DIR, `${id}.log`);
        if (!fs.existsSync(logFile)) {
          await interaction.editReply(`No log file found for job: \`${id}\``);
        } else {
          const lines = fs.readFileSync(logFile, 'utf8').split('\n').slice(-30).join('\n');
          await interaction.editReply(`**Last 30 lines of \`${id}.log\`:**\n\`\`\`\n${truncate(lines, 1800)}\n\`\`\``);
        }
      }

    } else {
      await interaction.editReply(`Unknown command: \`/${commandName}\``);
    }
  } catch (err) {
    console.error(`[slash] Error handling /${commandName}:`, err);
    await interaction.editReply(`❌ Error: ${err.message}`).catch(() => {});
  }
});

client.once('ready', () => {
  console.log(`[slash] Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('[slash] Failed to login:', err.message);
  process.exit(1);
});
