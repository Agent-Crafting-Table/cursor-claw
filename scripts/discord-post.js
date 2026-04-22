#!/usr/bin/env node
/**
 * discord-post.js — Post a message to a Discord channel.
 *
 * Usage:
 *   node scripts/discord-post.js <channel_id> "<message>"
 *
 * Environment:
 *   DISCORD_BOT_TOKEN — required
 */

'use strict';

const https = require('https');

const [,, channelId, ...messageParts] = process.argv;
const message = messageParts.join(' ');

if (!channelId || !message) {
  console.error('Usage: node discord-post.js <channel_id> "<message>"');
  process.exit(1);
}

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN not set');
  process.exit(1);
}

const body = JSON.stringify({ content: message });

const req = https.request({
  hostname: 'discord.com',
  path: `/api/v10/channels/${channelId}/messages`,
  method: 'POST',
  headers: {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  if (res.statusCode >= 400) {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.error(`Discord API error ${res.statusCode}: ${data}`);
      process.exit(1);
    });
  } else {
    console.log(`Posted to channel ${channelId}`);
  }
});

req.on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
