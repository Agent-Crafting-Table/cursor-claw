#!/usr/bin/env node
/**
 * discord-slash-register.js — Register slash commands with Discord.
 *
 * Run this once after initial setup, or whenever you add/change commands.
 *
 * Usage:
 *   node scripts/discord-slash-register.js
 *
 * Environment:
 *   DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID
 */

'use strict';

const https = require('https');

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !appId || !guildId) {
  console.error('DISCORD_BOT_TOKEN, DISCORD_APP_ID, and DISCORD_GUILD_ID are required');
  process.exit(1);
}

const commands = [
  {
    name: 'status',
    description: 'Check agent health — uptime, memory, cron status',
  },
  {
    name: 'model',
    description: 'Show or set the active Claude model',
    options: [{
      type: 3, // STRING
      name: 'name',
      description: 'Model alias: opus, sonnet, haiku',
      required: false,
    }],
  },
  {
    name: 'herc',
    description: 'Send an arbitrary prompt to your agent',
    options: [{
      type: 3,
      name: 'message',
      description: 'The prompt to send',
      required: true,
    }],
  },
  {
    name: 'cron',
    description: 'Manage cron jobs',
    options: [
      {
        type: 1, // SUB_COMMAND
        name: 'list',
        description: 'List all enabled cron jobs',
      },
      {
        type: 1,
        name: 'run',
        description: 'Manually trigger a cron job',
        options: [{
          type: 3,
          name: 'id',
          description: 'Job ID from jobs.json',
          required: true,
        }],
      },
    ],
  },
];

const body = JSON.stringify(commands);
const url = `/api/v10/applications/${appId}/guilds/${guildId}/commands`;

const req = https.request({
  hostname: 'discord.com',
  path: url,
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 400) {
      console.error(`Error ${res.statusCode}: ${data}`);
      process.exit(1);
    }
    console.log(`Registered ${commands.length} slash commands.`);
  });
});

req.on('error', err => { console.error(err.message); process.exit(1); });
req.write(body);
req.end();
