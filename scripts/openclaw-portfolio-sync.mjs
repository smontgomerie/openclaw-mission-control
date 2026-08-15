#!/usr/bin/env node
/**
 * Thin OpenClaw cron helper: pull Positions + Trades from Google Sheets via `gog`,
 * POST raw rows to Mission Control `POST /api/v1/portfolio/review/run`, print JSON result.
 *
 * Env:
 *   MISSION_CONTROL_BASE_URL (default http://127.0.0.1:8000)
 *   MISSION_CONTROL_TOKEN (required) — org-admin bearer
 *   OPENCLAW_WORKSPACE_ROOT (optional, for defaults only)
 *   PORTFOLIO_SHEET_ID, PORTFOLIO_POSITIONS_RANGE, PORTFOLIO_TRADES_RANGE, PORTFOLIO_GOOGLE_ACCOUNT
 */
import { execFileSync } from 'node:child_process';

const SHEET_ID = process.env.PORTFOLIO_SHEET_ID || '18TTdqThrMOflgqJjnpgSjIeKl_nJZxH2MTF6vg3M-YA';
const POSITIONS_RANGE = process.env.PORTFOLIO_POSITIONS_RANGE || 'Positions!A1:Z200';
const TRADES_RANGE = process.env.PORTFOLIO_TRADES_RANGE || 'Trades!A1:Z500';
const ACCOUNT = process.env.PORTFOLIO_GOOGLE_ACCOUNT || 'montgomerie.scott@gmail.com';
const BASE = (process.env.MISSION_CONTROL_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const TOKEN = process.env.MISSION_CONTROL_TOKEN || '';

function gogJson(...args) {
  const raw = execFileSync('gog', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` },
  }).trim();
  return JSON.parse(raw);
}

function asRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.values)) return payload.values;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  throw new Error('Unexpected gog sheets JSON shape');
}

async function main() {
  if (!TOKEN) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'MISSION_CONTROL_TOKEN is not set' }));
    process.exitCode = 1;
    return;
  }
  let positionsRows;
  try {
    positionsRows = asRows(
      gogJson('sheets', 'get', SHEET_ID, POSITIONS_RANGE, '--account', ACCOUNT, '--json'),
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    process.exitCode = 1;
    return;
  }
  let tradesRows = [];
  try {
    tradesRows = asRows(
      gogJson('sheets', 'get', SHEET_ID, TRADES_RANGE, '--account', ACCOUNT, '--json'),
    );
  } catch {
    tradesRows = [];
  }
  const res = await fetch(`${BASE}/api/v1/portfolio/review/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ positions_rows: positionsRows, trades_rows: tradesRows }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { ok: false, error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const detail = body && typeof body === 'object' ? body.detail || body.message : null;
    body = { ok: false, error: detail || text || `HTTP ${res.status}` };
  }
  process.stdout.write(JSON.stringify(body));
  if (!body.ok) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
});
