#!/usr/bin/env node
/**
 * cron-runner.js — Scheduled task runner for your Cursor agent.
 *
 * Reads crons/jobs.json, fires each enabled job on schedule.
 * Jobs are natural language prompts. The runner posts them to Discord
 * directly or delegates to an agent via `cursor --headless` if available.
 *
 * Usage:
 *   node scripts/cron-runner.js
 *
 * Environment variables:
 *   DISCORD_BOT_TOKEN  — Discord bot token for posting results
 *   AGENT_TIMEZONE     — Default timezone (fallback: UTC)
 *   WORKSPACE_DIR      — Workspace root (fallback: current directory)
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE_DIR || process.cwd();
const JOBS_FILE = path.join(WORKSPACE, 'crons', 'jobs.json');
const LOG_DIR = path.join(WORKSPACE, 'crons', 'logs');
const DEFAULT_TZ = process.env.AGENT_TIMEZONE || 'UTC';

// ── Minimal cron expression parser ──────────────────────────────────────────

function parseCronField(field, min, max) {
  if (field === '*') return null;
  const values = new Set();
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const s = parseInt(step, 10);
      const start = range === '*' ? min : parseInt(range.split('-')[0], 10);
      const end = range === '*' ? max : (range.includes('-') ? parseInt(range.split('-')[1], 10) : max);
      for (let i = start; i <= end; i += s) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }
  return values;
}

function cronMatches(expr, date) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = parts;

  const minSet = parseCronField(minF, 0, 59);
  const hourSet = parseCronField(hourF, 0, 23);
  const domSet = parseCronField(domF, 1, 31);
  const monSet = parseCronField(monF, 1, 12);
  const dowSet = parseCronField(dowF, 0, 6);

  if (minSet && !minSet.has(date.getMinutes())) return false;
  if (hourSet && !hourSet.has(date.getHours())) return false;
  if (domSet && !domSet.has(date.getDate())) return false;
  if (monSet && !monSet.has(date.getMonth() + 1)) return false;
  if (dowSet && !dowSet.has(date.getDay())) return false;
  return true;
}

// ── Job execution ────────────────────────────────────────────────────────────

const runningJobs = new Set();

function runJob(job) {
  if (runningJobs.has(job.id)) {
    console.log(`[cron] ${job.id} already running — skipping`);
    return;
  }

  runningJobs.add(job.id);
  const logFile = path.join(LOG_DIR, `${job.id}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const timeout = (job.timeoutSeconds || 120) * 1000;

  console.log(`[cron] Starting job: ${job.name}`);
  logStream.write(`\n--- ${new Date().toISOString()} ---\n`);

  // Post the job message to Discord as a prompt for the agent to pick up,
  // or run via cursor headless if configured.
  const discordPost = path.join(WORKSPACE, 'scripts', 'discord-post.js');
  const channelId = process.env.DISCORD_CHANNEL_ID;

  let proc;
  if (channelId && fs.existsSync(discordPost)) {
    const prompt = `[CRON JOB: ${job.name}]\n\n${job.message}`;
    proc = spawn('node', [discordPost, channelId, prompt], { env: process.env });
  } else {
    console.warn(`[cron] ${job.id}: No DISCORD_CHANNEL_ID set — logging job message only`);
    logStream.write(`JOB MESSAGE:\n${job.message}\n`);
    runningJobs.delete(job.id);
    logStream.end();
    return;
  }

  proc.stdout.on('data', d => logStream.write(d));
  proc.stderr.on('data', d => logStream.write(`[stderr] ${d}`));

  const timer = setTimeout(() => {
    proc.kill();
    console.warn(`[cron] ${job.id} timed out`);
  }, timeout);

  proc.on('close', (code) => {
    clearTimeout(timer);
    runningJobs.delete(job.id);
    logStream.end();
    console.log(`[cron] ${job.id} done (code ${code})`);
  });
}

// ── Scheduler loop ───────────────────────────────────────────────────────────

function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')).jobs || [];
  } catch (err) {
    console.error('[cron] Failed to load jobs.json:', err.message);
    return [];
  }
}

fs.mkdirSync(LOG_DIR, { recursive: true });

let lastMinute = -1;

setInterval(() => {
  const now = new Date();
  if (now.getMinutes() === lastMinute) return;
  lastMinute = now.getMinutes();

  const jobs = loadJobs();
  for (const job of jobs) {
    if (!job.enabled) continue;
    const tz = job.tz || DEFAULT_TZ;
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    if (cronMatches(job.schedule, localDate)) {
      runJob(job);
    }
  }
}, 15000);

console.log('[cron] Cron runner started. Checking jobs every 15s.');
