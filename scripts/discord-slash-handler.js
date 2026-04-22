#!/usr/bin/env node
/**
 * discord-slash-handler.js — Handle Discord slash command interactions.
 *
 * Runs as a persistent process. Listens for interactionCreate events
 * via discord.js gateway and handles agent commands.
 *
 * Usage:
 *   node scripts/discord-slash-handler.js
 *
 * Environment:
 *   DISCORD_BOT_TOKEN, DISCORD_APP_ID, WORKSPACE_DIR
 */

'use strict';

const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE_DIR || process.cwd();
const JOBS_FILE = path.join(WORKSPACE, 'crons', 'jobs.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  await interaction.deferReply();

  try {
    if (commandName === 'status') {
      const threads = fs.existsSync(path.join(WORKSPACE, 'memory', 'active-threads.md'))
        ? fs.readFileSync(path.join(WORKSPACE, 'memory', 'active-threads.md'), 'utf8').slice(0, 800)
        : 'No active threads file.';

      await interaction.editReply(
        `**Agent Status**\n\`\`\`\n${threads}\n\`\`\``
      );

    } else if (commandName === 'agent') {
      const message = interaction.options.getString('message');
      // Post to the Discord channel — the agent picks it up via MCP
      await interaction.editReply(`Sending to agent: ${message}`);

    } else if (commandName === 'cron') {
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') {
        let jobs = [];
        try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).jobs || []; } catch {}
        const enabled = jobs.filter(j => j.enabled);
        if (!enabled.length) {
          await interaction.editReply('No enabled cron jobs.');
        } else {
          const lines = enabled.map(j => `• **${j.id}** — ${j.name} \`${j.schedule}\``);
          await interaction.editReply(lines.join('\n').slice(0, 1900));
        }

      } else if (sub === 'run') {
        const id = interaction.options.getString('id');
        let jobs = [];
        try { jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).jobs || []; } catch {}
        const job = jobs.find(j => j.id === id);
        if (!job) {
          await interaction.editReply(`Job not found: ${id}`);
        } else {
          await interaction.editReply(`Triggering **${job.name}**...`);
          // Post job message to Discord for agent pickup
          const { spawn } = require('child_process');
          const discordPost = path.join(WORKSPACE, 'scripts', 'discord-post.js');
          const channelId = process.env.DISCORD_CHANNEL_ID;
          if (channelId) {
            spawn('node', [discordPost, channelId, `[CRON JOB: ${job.name}]\n\n${job.message}`], {
              env: process.env,
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
        }
      }
    }
  } catch (err) {
    console.error('[slash]', err);
    await interaction.editReply(`Error: ${err.message}`).catch(() => {});
  }
});

client.once('ready', () => {
  console.log(`[slash] Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
  console.error('[slash] Failed to login:', err.message);
  process.exit(1);
});
