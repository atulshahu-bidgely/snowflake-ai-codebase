/**
 * Secure Backend Proxy Server for Snowflake Cortex Agents
 *
 * This server acts as a proxy between the frontend and Snowflake APIs,
 * keeping the Personal Access Token (PAT) secure on the server side.
 *
 * Security Features:
 * - PAT is never exposed to the browser/client
 * - CORS configured for specific origins
 * - Request validation and sanitization
 * - Rate limiting to prevent abuse
 * - Proper error handling without exposing sensitive info
 *
 * Credit Tracking:
 * - After each agent response, the server polls SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY
 *   using the Snowflake request ID extracted from the SSE stream (or HTTP header as fallback).
 * - Polling schedule: +10s, +20s, ..., +100s, +150s, +200s, +250s, +300s after stream end.
 * - Credits and USD cost are attached to the LangSmith run once found.
 * - LangSmith latency reflects only the actual agent response time (not the polling wait).
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const { Client } = require('langsmith');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { HTTP_STATUS, ERROR_MESSAGES, CONFIG } = require('./constants');
const LEFT_COST = Number(process.env.LEFT_COST || 1);
const MIDDLE_COST = Number(process.env.MIDDLE_COST || 10);
const RIGHT_COST = Number(process.env.RIGHT_COST || 20);
// Credits an account resets/starts with. Single source of truth for the allowance shown in the UI.
// NO fallback: if RESET_CREDITS is missing or invalid we crash on startup so the problem is obvious.
function resolveResetCredits() {
  var raw = process.env.RESET_CREDITS;
  var cleaned = String(raw == null ? '' : raw).replace(/[,_\s]/g, '');
  var n = Number(cleaned);
  if (raw == null || String(raw).trim() === '' || !isFinite(n) || n < 0) {
    console.error('RESET_CREDITS is missing or invalid (got: ' + JSON.stringify(raw) + '). Set a valid non-negative number in .env, e.g. RESET_CREDITS=1000.');
    process.exit(1);
  }
  return n;
}
const RESET_CREDITS = resolveResetCredits();
console.log('Credit allowance (RESET_CREDITS): ' + RESET_CREDITS);

const app = express();
// Render uses PORT, local dev uses SERVER_PORT
const PORT = process.env.PORT || process.env.SERVER_PORT || CONFIG.DEFAULT_PORT;

// ============================================================================
// Configuration & Validation
// ============================================================================

const validateEnvironment = () => {
  const required = ['SNOWFLAKE_HOST', 'SNOWFLAKE_PAT', 'SNOWFLAKE_DATABASE', 'SNOWFLAKE_SCHEMA'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ All required environment variables are set');
};

validateEnvironment();

// Assembled once from env vars so nothing sensitive is scattered across the codebase.
const SNOWFLAKE_CONFIG = {
  host:     process.env.SNOWFLAKE_HOST,      // e.g. abc123.snowflakecomputing.com
  pat:      process.env.SNOWFLAKE_PAT,       // Personal Access Token (never sent to client)
  database: process.env.SNOWFLAKE_DATABASE,
  schema:   process.env.SNOWFLAKE_SCHEMA,
};

// ── Agent catalog ─────────────────────────────────────────────────────────────
// Optional: set AGENTS env var as "Label|db.schema.agent_name,..." to restrict
// to a specific subset. When AGENTS is unset, all agents in the schema are listed
// dynamically from Snowflake and any of them can be messaged.
const parseAgentCatalog = () => {
  if (!process.env.AGENTS) return []; // empty = fetch all from Snowflake dynamically
  return process.env.AGENTS.split(',')
    .map((entry) => {
      const [label, fullName] = entry.split('|').map(s => (s || '').trim());
      if (!label || !fullName) return null;
      const shortName = fullName.split('.').pop().toLowerCase();
      return { id: shortName, label, fullName, shortName };
    })
    .filter(Boolean);
};

const AGENTS_CATALOG = parseAgentCatalog();
// Set for O(1) allowlist checks — compare lowercase so URL params are case-insensitive
const CATALOG_SHORT_NAMES = new Set(AGENTS_CATALOG.map(a => a.shortName));

const catalogSummary = AGENTS_CATALOG.map(a => a.label + ' (' + a.shortName + ')').join(', ') || '(empty)';
console.log('🗂️  Agent catalog: ' + catalogSummary);

// LangSmith is optional — if no API key is set, all tracing calls are no-ops.
const LANGSMITH_ENABLED = Boolean(process.env.LANGSMITH_API_KEY);
const langsmith = LANGSMITH_ENABLED
  ? new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
      apiUrl: process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com',
    })
  : null;
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || 'Energy_Assistant_2.0';

// ============================================================================
// Middleware Configuration
// ============================================================================

/**
 * CORS: development allows all origins; production restricts to ALLOWED_ORIGINS env var.
 * Set ALLOWED_ORIGINS=* to allow all (not recommended for prod).
 */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile apps, Postman, curl, etc.
    if (process.env.NODE_ENV === 'development') return callback(null, true);

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  exposedHeaders: ['X-Credits-Left', 'X-Charged-Cost', 'X-Has-Enough-Credits'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate limiter — window and max come from constants.js so they can be tuned per environment.
const limiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT_WINDOW_MS,
  max: CONFIG.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Helper Functions
// ============================================================================

/** PAT auth headers required by every Snowflake REST call. Token stays server-side. */
const getSnowflakeAuthHeaders = () => ({
  'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
  'Authorization': `Bearer ${SNOWFLAKE_CONFIG.pat}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'DashAI-Proxy/1.0.0',
});

/**
 * Strips sensitive details from errors before sending them to clients.
 * Production returns a generic message; development redacts Bearer tokens.
 */
const sanitizeError = (error) => {
  if (process.env.NODE_ENV === 'production') {
    return { message: 'An error occurred while processing your request', code: 'INTERNAL_ERROR' };
  }
  return {
    message: error.message?.replace(/Bearer\s+[\w-]+/g, 'Bearer [REDACTED]') || 'Unknown error',
    code: error.code || 'UNKNOWN_ERROR',
  };
};

/** Allows only alphanumeric, underscore, hyphen, and dot — prevents path-traversal/injection. */
const validateAgentName = (agentName) => {
  if (!agentName || typeof agentName !== 'string') return false;
  return /^[a-zA-Z0-9_\-.]+$/.test(agentName) && agentName.length <= CONFIG.MAX_AGENT_NAME_LENGTH;
};

/**
 * Hard gate: only agents whose name starts with "ENERGY" may be listed, described, or
 * messaged. This is enforced server-side (not just hidden in the UI) so non-energy agents
 * — e.g. PROGRAM_MANAGER — cannot be reached by hand-crafting a request or inspecting element.
 * Matches the frontend display rule exactly.
 */
const isEnergyAgent = (name) =>
  typeof name === 'string' && name.toLowerCase().startsWith('energy');

/** UUID v4 generator — used for LangSmith run IDs so we control the ID before creation. */
const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

/** Writes a single SSE event. Used to surface errors after headers are already flushed. */
const writeSseEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/** Buffers a Node.js readable stream into a UTF-8 string. */
const collectStreamBody = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  stream.on('error', reject);
});

/**
 * Sends the agent :run request over raw Node https (HTTP/1.1) rather than fetch.
 * Node's fetch can negotiate HTTP/2 with Snowflake, which has intermittently
 * terminated with a GOAWAY frame mid-stream; forcing HTTP/1.1 avoids that failure mode.
 *
 * Resolves with { upstreamRequest, upstreamResponse } once response headers arrive.
 */
const postSnowflakeAgentMessage = (endpoint, requestBody) => new Promise((resolve, reject) => {
  const url = new URL(endpoint);
  const payload = JSON.stringify(requestBody);
  const headers = {
    ...getSnowflakeAuthHeaders(),
    Accept: 'text/event-stream, application/json',
    Connection: 'close',
    'Content-Length': Buffer.byteLength(payload),
  };
  const upstreamRequest = https.request(
    { method: 'POST', hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`, headers, timeout: 0 },
    upstreamResponse => resolve({ upstreamRequest, upstreamResponse })
  );
  upstreamRequest.on('error', reject);
  upstreamRequest.write(payload);
  upstreamRequest.end();
});

/**
 * Builds the errorParts array for a failed Snowflake response.
 * tipOverrides maps status codes to custom tip strings, falling back to ERROR_MESSAGES.TIPS.
 */
const buildSnowflakeErrorParts = (status, statusText, errorBody = null, tipOverrides = {}) => {
  const errorParts = [
    ERROR_MESSAGES.ERROR_PREFIX,
    `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${status} ${statusText}`,
  ];

  if (errorBody && status !== HTTP_STATUS.BAD_REQUEST && status !== HTTP_STATUS.UNAUTHORIZED) {
    errorParts.push(errorBody.error || errorBody.message || JSON.stringify(errorBody, null, 2));
  }

  const tips = {
    [HTTP_STATUS.BAD_REQUEST]:  ERROR_MESSAGES.TIPS.BAD_REQUEST,
    [HTTP_STATUS.UNAUTHORIZED]: ERROR_MESSAGES.TIPS.UNAUTHORIZED,
    [HTTP_STATUS.NOT_FOUND]:    ERROR_MESSAGES.TIPS.NOT_FOUND,
    ...tipOverrides,
  };
  if (tips[status]) errorParts.push(tips[status]);

  return errorParts;
};

/** Returns true for network-level failures (DNS, connection refused, fetch transport error). */
const isNetworkError = (error) =>
  error.cause?.code === 'ENOTFOUND' ||
  error.cause?.code === 'ECONNREFUSED' ||
  error.message?.includes('fetch failed');

/** Sends a 503 Service Unavailable response with a standard Snowflake connectivity tip. */
const replyNetworkError = (res) => {
  const errorParts = [
    ERROR_MESSAGES.ERROR_PREFIX,
    `${ERROR_MESSAGES.HTTP_ERROR_STATUS} ${HTTP_STATUS.SERVICE_UNAVAILABLE} Service Unavailable`,
    ERROR_MESSAGES.TIPS.SERVICE_UNAVAILABLE,
  ];
  return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({ errorParts });
};

// ============================================================================
// Credit Lookup
// ============================================================================

/**
 * Extracts the Snowflake request_id from the `response.completed` SSE event payload.
 * Used to look up the exact row in CORTEX_AGENT_USAGE_HISTORY, making credit
 * attribution unambiguous under concurrent queries.
 * Returns null if the event is missing or the JSON is malformed.
 */
const extractRequestIdFromSSE = (sseText) => {
  for (const event of sseText.split(/\n\n+/)) {
    const lines = event.split('\n');
    let isCompleted = false;
    let dataLine = null;
    for (const line of lines) {
      if (line.startsWith('event:') && line.includes('response.completed')) isCompleted = true;
      if (line.startsWith('data:')) dataLine = line.slice(5).trim();
    }
    if (isCompleted && dataLine) {
      try {
        const parsed = JSON.parse(dataLine);
        if (parsed.request_id) return parsed.request_id;
      } catch { /* malformed JSON — skip */ }
    }
  }
  return null;
};

/**
 * Extracts input/output token counts from the SSE stream.
 *
 * Token usage lives at `metadata.usage.tokens_consumed[0]` of the agent's `response`
 * event. We scan `data:` lines directly (CRLF-safe) and key off that exact path
 * rather than the event name — the previous `/\n\n+/` event-splitting failed on
 * `\r\n` streams (events never split, so the last data line — `response.completed`,
 * which has no usage — was read instead of the `response` event). No recursive scan,
 * so unrelated numbers can't be mistaken for tokens. Last match wins.
 */
const extractTokensFromSSE = (sseText) => {
  let result = { inputTokens: null, outputTokens: null };
  const pick = (v) => (typeof v === 'number' ? v : (v && typeof v.total === 'number' ? v.total : null));

  for (const raw of sseText.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload.startsWith('{')) continue;
    try {
      const t = JSON.parse(payload)?.metadata?.usage?.tokens_consumed?.[0];
      if (t) {
        const i = pick(t.input_tokens), o = pick(t.output_tokens);
        if (i != null || o != null) result = { inputTokens: i, outputTokens: o };
      }
    } catch { /* skip non-JSON / partial data lines */ }
  }
  return result;
};

/**
 * Queries SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY for the row matching
 * the given request ID and returns { credits, costUSD }.
 *
 * ACCOUNT_USAGE has a propagation lag (typically 30–120s), so this may return null
 * on early attempts — the caller retries on a schedule.
 *
 * If the warehouse is still resuming, Snowflake returns a statementHandle; this
 * function polls that handle (up to 30 × 2s = 60s) until the query succeeds or fails.
 *
 * Returns null if the row isn't found yet or on any error — never falls back to a
 * different row, so a null result always means "retry later."
 */
// Validates requestId before SQL interpolation — prevents injection if SSE/header is tampered
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fetchCredits = async (requestId) => {
  if (!process.env.SNOWFLAKE_WAREHOUSE || !requestId) return null;

  if (!UUID_PATTERN.test(requestId)) {
    console.warn(`⚠️  fetchCredits: invalid requestId format, skipping — "${requestId}"`);
    return null;
  }

  const sql = `SELECT TOKEN_CREDITS FROM SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY WHERE REQUEST_ID = '${requestId}' LIMIT 1`;
  const base = `https://${SNOWFLAKE_CONFIG.host}/api/v2/statements`;

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: getSnowflakeAuthHeaders(),
      body: JSON.stringify({
        statement: sql,
        warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'wh_agent_demo',
        role:      process.env.SNOWFLAKE_ROLE || undefined,
        database:  'SNOWFLAKE',
        schema:    'ACCOUNT_USAGE',
        timeout:   60,
      }),
    });

    let data = await res.json().catch(() => null);
    if (!data) return null;

    // Warehouse may still be resuming — poll the statement handle until done
    if ((res.status === 408 || data.status === 'RUNNING' || data.status === 'QUEUED') && data.statementHandle) {
      const pollUrl = `${base}/${data.statementHandle}`;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(pollUrl, { headers: getSnowflakeAuthHeaders() });
        data = await poll.json().catch(() => null);
        if (!data || data.status === 'FAILED') return null;
        if (data.status === 'SUCCESS') break;
      }
    }

    const rows = data?.data;
    if (!rows || !rows[0] || rows[0][0] === null) return null; // row not yet propagated

    const credits = parseFloat(rows[0][0]);
    // A legitimate 0-credit row is valid — only NaN means the row isn't there yet
    if (Number.isNaN(credits)) return null;

    // Fall back to 2.85 if CONFIG.CREDIT_COST_USD is missing — avoids NaN cost
    const creditCostUsd = Number(CONFIG.CREDIT_COST_USD) || 2.85;
    return { credits, costUSD: credits * creditCostUsd };
  } catch (err) {
    console.warn('⚠️  fetchCredits failed:', err.message);
    return null;
  }
};

// ============================================================================
// LangSmith Tracing
// ============================================================================

/**
 * Opens a LangSmith run. We generate the run ID here so we can reference it in
 * the async credit-update job without a second API call.
 * Returns the runId, or null if LangSmith is disabled or the call fails.
 */
const createLangSmithRun = async ({ req, agentName, requestBody }) => {
  if (!langsmith) return null;
  try {
    const runId = uuidv4();
    // Category card the user picked in the UI (e.g. "Analyse Trends"); null for free-form queries.
    // Sent by the frontend in requestBody.metadata.
    const category = requestBody.metadata?.category || null;
    const USER = process.env.USER_ID || 'unknown_user';
    await langsmith.createRun({
      id: runId,
      name: 'snowflake-agent-proxy',
      // 'llm' so LangSmith promotes outputs.usage_metadata into THIS run's own
      // Tokens/Cost columns. A 'chain' run only sums tokens from child llm runs
      // (there are none here), which is why the Tokens column read 0.
      run_type: 'llm',
      project_name: LANGSMITH_PROJECT,
      // Surface the category AND the agent as run tags so they show up — and are
      // filterable/groupable — in the LangSmith run list, not just buried in metadata.
      tags: [
        ...(category ? [`category:${category}`] : []),
        `Agent = ${agentName}`,
        `User ID = ${USER}`,
      ],
        inputs: {
          agentName,
          messages: requestBody.messages || [],
          metadata: requestBody.metadata || {},
      },
      extra: {
        metadata: {
          route:     req.path,
          method:    req.method,
          userAgent: req.get('user-agent') || '',
          streamed:  Boolean(requestBody.stream),
          category,
          agent: agentName,
        },
      },
    });
    return runId;
  } catch (err) {
    console.warn('⚠️ LangSmith createRun failed:', err.message);
    return null;
  }
};

/**
 * Closes a LangSmith run for non-streaming responses and error paths.
 * For streaming successes, use closeRunWithCredits instead — it waits for
 * credit data so both cost and output land in a single update (avoiding a 409).
 */
const finishLangSmithRun = async (
 runId,
 { output, error, status, latencyMs, streamed, metadata = {} }
) => {
 if (!langsmith || !runId) return;
 try {
 await langsmith.updateRun(runId, {
 outputs: output !== undefined ? { response: output } : undefined,
 error: error ? (typeof error === 'string' ? error : JSON.stringify(error)) : undefined,
 extra: {
 metadata: {
 status,
 latencyMs,
 streamed,
 ...metadata,
 },
 },
 });
 } catch (err) {
 console.warn('⚠️ LangSmith updateRun failed:', err.message);
 }
};


/**
 * Builds the usage_metadata object LangSmith reads (from run outputs) to populate
 * the Tokens column (input/output/total_tokens, parsed from the SSE stream) and the
 * Cost column (total_cost, from the Snowflake credit lookup). Returns undefined when
 * there is nothing to report so we never write an empty object.
 */
const buildUsageMetadata = ({ inputTokens, outputTokens, costUSD } = {}) => {
  const hasTokens = inputTokens != null || outputTokens != null;
  const hasCost   = costUSD != null;
  if (!hasTokens && !hasCost) return undefined;

  const meta = {};
  if (hasTokens) {
    meta.input_tokens  = inputTokens  ?? 0;
    meta.output_tokens = outputTokens ?? 0;
    meta.total_tokens  = (inputTokens ?? 0) + (outputTokens ?? 0);
  }
  if (hasCost) meta.total_cost = costUSD;
  return meta;
};

/**
 * Closes a LangSmith run for streaming responses, attaching Snowflake credit data.
 *
 * ACCOUNT_USAGE propagation lag means credits aren't immediately available.
 * This fires the first lookup at +10s and retries on an escalating schedule up
 * to +300s, closing the run exactly once — with credits if found, without if exhausted.
 *
 * end_time is always set to streamEndTime (moment the last SSE chunk arrived) so
 * LangSmith shows real agent latency, not polling-inflated wall-clock time.
 *
 * Polling schedule (seconds after stream end):
 *   10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300
 */
const closeRunWithCredits = (runId, { output, status, latencyMs, streamEndTime, requestId, expectedSize, inputTokens, outputTokens, creditsLeft }) => {
  if (!langsmith || !runId) return;

  // No request ID — nothing to look up, close immediately instead of spinning 300s
  if (!requestId) {
    const usage_metadata = buildUsageMetadata({ inputTokens, outputTokens });
    langsmith.updateRun(runId, {
      outputs: { response: output, ...(usage_metadata && { usage_metadata }) },
      end_time: streamEndTime,
      extra: { metadata: { status, latencyMs, streamed: true } },
    }).catch(err => console.warn('⚠️ LangSmith updateRun failed:', err.message));
    return;
  }

  // Cumulative offsets in ms — gaps between attempts are consecutive differences
  const OFFSETS_MS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 150_000, 200_000, 250_000, 300_000];
  const startedAt = Date.now();
  let attempt = 0;

  const tryClose = async () => {
    attempt++;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    try {
      const credits = await fetchCredits(requestId);

      if (credits) {
        const usage_metadata = buildUsageMetadata({ inputTokens, outputTokens, costUSD: credits.costUSD });
        await langsmith.updateRun(runId, {
          outputs: { response: output, ...(usage_metadata && { usage_metadata }) },
          end_time: streamEndTime, // actual stream end, not now
          extra: {
            metadata: {
              status, latencyMs, streamed: true,
              snowflake_request_id: requestId,
              snowflake_credits:    credits.credits,
              snowflake_cost_usd:   credits.costUSD,
              output_size_mb:       expectedSize,
              credits_left:         creditsLeft,
            },
          },
        });
        console.log(`💳 Credits found at +${elapsed}s — ${credits.credits} credits = $${credits.costUSD.toFixed(4)}`);
        return;
      }

      if (attempt < OFFSETS_MS.length) {
        const nextDelay = OFFSETS_MS[attempt] - OFFSETS_MS[attempt - 1];
        console.log(`⏳ No credits yet at +${elapsed}s, retrying at +${OFFSETS_MS[attempt] / 1000}s...`);
        setTimeout(tryClose, nextDelay);
      } else {
        // All 300s exhausted — close without credits rather than leave the run open
        console.warn(`⚠️ No credit data after +${elapsed}s, closing run without credits`);
        const usage_metadata = buildUsageMetadata({ inputTokens, outputTokens });
        await langsmith.updateRun(runId, {
          outputs: { response: output, ...(usage_metadata && { usage_metadata }) },
          end_time: streamEndTime,
          extra: { metadata: { status, latencyMs, streamed: true, output_size_mb: expectedSize } },
        });
      }
    } catch (err) {
      console.warn(`⚠️ closeRunWithCredits attempt ${attempt} failed:`, err.message);
      if (attempt < OFFSETS_MS.length) {
        setTimeout(tryClose, OFFSETS_MS[attempt] - OFFSETS_MS[attempt - 1]);
      }
    }
  };

  setTimeout(tryClose, OFFSETS_MS[0]);
  console.log(`🔄 Credit polling started for run ${runId} — request ID: ${requestId} (checks at +10s through +300s)`);
};

// ============================================================================
// API Routes
// ============================================================================

// GET /health — used by load balancers and uptime monitors
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ============================================================================
// GET /api/usage — credits remaining + per-question-type credit costs (from .env)
// ----------------------------------------------------------------------------
// The frontend UsagePopover reads this to display:
//   • credits left for the current USER_ID (live value from user_tracker.csv)
//   • the credit cost of each question type (LEFT_COST / MIDDLE_COST / RIGHT_COST)
//   • the credit allowance the account resets to (RESET_CREDITS)
// All numbers are sourced from the backend .env so the UI stays in sync with
// the real deduction/reset logic.
// ============================================================================
app.get('/api/usage', (req, res) => {
  const fs = require('fs');

  const CREDIT_ALLOWANCE = RESET_CREDITS;
  const RESET_INTERVAL   = (process.env.RESET_INTERVAL || 'day').toLowerCase();
  const userId           = process.env.USER_ID || 'unknown_user';
  const trackerPath      = path.resolve(__dirname, '../user_tracker.csv');

  // Default to a full allowance if the user has no row yet (first request adds them).
  let creditsLeft = CREDIT_ALLOWANCE;

  try {
    if (fs.existsSync(trackerPath)) {
      const lines = fs.readFileSync(trackerPath, 'utf8').trim().split('\n').filter(Boolean);
      const dataLines = lines.slice(1); // skip header
      const row = dataLines.find(line => line.split(',')[0].trim() === userId);
      if (row) {
        const parsed = parseFloat(row.split(',')[1]);
        if (!Number.isNaN(parsed)) creditsLeft = parsed;
      }
    }
  } catch (err) {
    console.warn('⚠️  /api/usage: could not read user_tracker.csv:', err.message);
  }

  const creditsUsed = Math.max(CREDIT_ALLOWANCE - creditsLeft, 0);

  res.json({
    userId,
    creditsLeft,
    creditsUsed,
    creditAllowance: CREDIT_ALLOWANCE,
    resetInterval: RESET_INTERVAL,
    // Per-question-type credit costs, straight from .env
    costs: {
      dataQuery:     LEFT_COST,
      trendAnalysis: MIDDLE_COST,
      targeting:     RIGHT_COST,
    },
  });
});

// POST /api/feedback — submit like/dislike to LangSmith
app.post('/api/feedback', async (req, res) => {
  const { runId, score } = req.body;
  if (!runId || score === undefined) {
    return res.status(400).json({ error: 'runId and score are required' });
  }
  if (!langsmith) {
    return res.status(503).json({ error: 'LangSmith is not configured on this server' });
  }
  try {
    const value = score === 1 ? 'verified' : 'wrong';
    await langsmith.createFeedback(runId, 'user_feedback', {
      score,        // 1 = like (verified), 0 = dislike (wrong)
      value,
    });
    console.log(`👍 Feedback submitted for run ${runId}: ${value}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error submitting feedback:', error.message);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// GET /api/agents — returns agent catalog (or lists all from Snowflake if no catalog configured)
app.get('/api/agents', async (req, res) => {
  try {
    // Catalog configured — return synthetic list so the frontend can populate the dropdown
    // without a Snowflake round-trip. The frontend will call GET /api/agents/:name for details.
    if (AGENTS_CATALOG.length > 0) {
      const list = AGENTS_CATALOG.map(a => ({
        name: a.shortName,
        database_name: SNOWFLAKE_CONFIG.database,
        schema_name:   SNOWFLAKE_CONFIG.schema,
        label:         a.label,        // extra field used by the frontend picker
      }));
      console.log(`✅ Returning ${list.length} agents from catalog`);
      return res.json(list);
    }

    // No catalog — fall back to listing everything in the schema from Snowflake
    const endpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents`;
    console.log('📡 Fetching agents list from Snowflake (no catalog configured)...');
    const response = await fetch(endpoint, { method: 'GET', headers: getSnowflakeAuthHeaders() });
    if (!response.ok) {
      let errorBody = null;
      if (response.headers.get('content-type')?.includes('application/json')) {
        errorBody = await response.json().catch(() => null);
      }
      const errorParts = buildSnowflakeErrorParts(response.status, response.statusText, errorBody);
      console.error('❌ Snowflake API error:', response.status, errorParts.join('\n'));
      return res.status(response.status).json({ errorParts });
    }
    const data = await response.json();
    console.log(`✅ Fetched ${Array.isArray(data) ? data.length : 'unknown'} agents`);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching agents:', error.message);
    if (isNetworkError(error)) return replyNetworkError(res);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// GET /api/agents/:agentName — returns details for a single Cortex Agent
app.get('/api/agents/:agentName', async (req, res) => {
  try {
    const agentName = req.params.agentName; // case-sensitive; use as provided by the client
    if (!validateAgentName(agentName)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.TIPS.INVALID_AGENT_NAME });
    }
    if (!isEnergyAgent(agentName)) {
      console.warn(`⛔ Rejected non-energy agent (describe): "${agentName}"`);
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: `Agent "${agentName}" is not available.` });
    }

    const endpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents/${agentName}`;
    console.log(`📡 Fetching details for agent: ${agentName}...`);

    const response = await fetch(endpoint, { method: 'GET', headers: getSnowflakeAuthHeaders() });

    if (!response.ok) {
      let errorBody = null;
      if (response.headers.get('content-type')?.includes('application/json')) {
        errorBody = await response.json().catch(() => null);
      }
      const errorParts = buildSnowflakeErrorParts(
        response.status, response.statusText, errorBody,
        { [HTTP_STATUS.NOT_FOUND]: ERROR_MESSAGES.TIPS.NOT_FOUND_AGENT(agentName) }
      );
      console.error('❌ Snowflake API error:', response.status, errorParts.join('\n'));
      return res.status(response.status).json({ errorParts });
    }

    const data = await response.json();
    console.log(`✅ Fetched details for agent: ${agentName}`);
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching agent details:', error.message);
    if (isNetworkError(error)) return replyNetworkError(res);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/agents/:agentName/messages — sends a message to a Cortex Agent and streams the response.
 *
 * Flow:
 *  1. Validate request, open a LangSmith run.
 *  2. Forward to Snowflake's agent :run endpoint via HTTP/1.1.
 *  3. If SSE, pipe chunks to the client while accumulating the full text.
 *  4. On stream end, extract the Snowflake request ID from the response.completed event
 *     (falling back to the x-snowflake-request-id HTTP header).
 *  5. Start background credit polling (closeRunWithCredits) — closes the LangSmith run
 *     with credit data once propagated, or without it after 300s.
 */
app.post('/api/agents/:agentName/messages', async (req, res) => {
  const startTime = Date.now();
  let langsmithRunId = null;

  try {
    // Use the agent name from the URL — never override from env (that's what broke switching).
    // Snowflake agent names are CASE-SENSITIVE (e.g. ENERGY_AMI_AGENT_DEMO), so keep the
    // original casing for the :run endpoint. Only lowercase a copy for the allowlist check.
    const agentName = req.params.agentName;
    const agentNameLower = agentName.toLowerCase();
    const requestBody = req.body;

    if (!validateAgentName(agentName)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.TIPS.INVALID_AGENT_NAME });
    }

    // Energy-only gate — only agents whose name starts with "ENERGY" may be messaged.
    // Enforced here so no one can reach other agents (e.g. PROGRAM_MANAGER) by inspecting
    // element or crafting a request directly.
    if (!isEnergyAgent(agentName)) {
      console.warn(`⛔ Rejected non-energy agent: "${agentName}"`);
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: `Agent "${agentName}" is not available.` });
    }

    // Allowlist check — reject agents not in the catalog (prevents probing arbitrary agents)
    if (AGENTS_CATALOG.length > 0 && !CATALOG_SHORT_NAMES.has(agentNameLower)) {
      console.warn(`⛔ Rejected unlisted agent: "${agentName}"`);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: `Agent "${agentName}" is not in the allowed catalog.` });
    }
    if (!requestBody.messages || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.TIPS.MESSAGES_REQUIRED });
    }

    langsmithRunId = await createLangSmithRun({ req, agentName, requestBody });
    const requestedCategory = requestBody.metadata?.category || null;
    console.log(`💬 Sending message to agent: ${agentName}${requestedCategory ? ` (category: ${requestedCategory})` : ''}`);

    // HERE THE CATEGORY IS RETRIEVED BUT THE REQUEST TO THE BOT ITSELF IS NOT SENT
    // ── User credit lookup ───────────────────────────────────────────────────
    // Reads user_tracker.csv (sibling of the server/ folder). If the user is
    // not found they are added with RESET_CREDITS credits so future requests can deduct.
   const normalizeCategory = (value) => String(value || '').trim().toLowerCase();

const getCategoryCost = (category) => {
 const normalized = normalizeCategory(category);

 if (normalized === 'get data') return LEFT_COST;
 if (normalized === 'analyze trends') return MIDDLE_COST;
 if (normalized === 'analyse trends') return MIDDLE_COST;
 if (normalized === 'target programs') return RIGHT_COST;

 return 20;
};

// ── User credit lookup and deduction ─────────────────────────────────────
const USER_TRACKER_PATH = path.resolve(__dirname, '../user_tracker.csv');
let creditsLeft = 0;
let chargedCost = 0;
let hasEnoughCredits = true;

try {
 const fs = require('fs');
 const csvRaw = fs.existsSync(USER_TRACKER_PATH)
 ? fs.readFileSync(USER_TRACKER_PATH, 'utf8')
 : 'user_id,credits\n';

 const csvLines = csvRaw.trim().split('\n').filter(Boolean);
 const header = csvLines[0] || 'user_id,credits';
 const dataLines = csvLines.slice(1);

 const userId = process.env.USER_ID || 'unknown_user';
 const category = requestBody.metadata?.category || '';
 chargedCost = getCategoryCost(category);

 let userFound = false;
 let updatedDataLines = [...dataLines];

 for (let i = 0; i < updatedDataLines.length; i++) {
 const [csvUserId, csvCredits] = updatedDataLines[i].split(',');

 if (csvUserId.trim() !== userId) continue;

 userFound = true;
 const currentCredits = parseFloat(csvCredits) || 0;

 if (currentCredits < chargedCost) {
  hasEnoughCredits = false;
  creditsLeft = 0;
  chargedCost = 0;

  console.log(
   `❌ Insufficient credits for user ${userId} | category: ${category || 'none'} | current: ${currentCredits}`
  );
 } else {
  const updatedCredits = currentCredits - chargedCost;
  creditsLeft = updatedCredits;

  updatedDataLines[i] = `${userId},${updatedCredits}`;

  console.log(
   `👤 User ${userId} found | category: ${category || 'none'} | charge: ${chargedCost} | credits left: ${creditsLeft}`
  );
 }

 break;
 }

 if (!userFound) {
  const startingCredits = RESET_CREDITS;

  if (startingCredits < chargedCost) {
   hasEnoughCredits = false;
   creditsLeft = 0;
   chargedCost = 0;

   console.log(
    `❌ Insufficient credits for new user ${userId} | category: ${category || 'none'} | current: ${startingCredits}`
   );
  } else {
   const updatedCredits = startingCredits - chargedCost;
   creditsLeft = updatedCredits;

   updatedDataLines.push(`${userId},${updatedCredits}`);

   console.log(
    `👤 New user ${userId} added | category: ${category || 'none'} | charge: ${chargedCost} | credits left: ${creditsLeft}`
   );
  }
 }

 // only write CSV if credits are sufficient
 if (hasEnoughCredits) {
  const updatedCsv = [header, ...updatedDataLines].join('\n') + '\n';
  fs.writeFileSync(USER_TRACKER_PATH, updatedCsv, 'utf8');
 }
} catch (csvErr) {
 console.warn('⚠️ Could not read/write user_tracker.csv:', csvErr.message);
}

// ── Signal updated credits to the client immediately (as soon as the request
//    goes through the CSV check) — sent as response headers so the frontend can
//    refresh the credits pill the moment the stream's headers arrive, without
//    waiting for the full agent response.
if (!res.headersSent) {
 res.setHeader('X-Credits-Left', String(creditsLeft));
 res.setHeader('X-Charged-Cost', String(chargedCost));
 res.setHeader('X-Has-Enough-Credits', String(hasEnoughCredits));
}

if (!hasEnoughCredits) {
 await finishLangSmithRun(langsmithRunId, {
 output: { message: 'Insufficient credits' },
 status: 402,
 latencyMs: Date.now() - startTime,
 streamed: false,
 metadata: {
  credits_left: 0,
  snowflake_cost_usd: 0,
  has_enough_credits: false,
  charged_cost: 0,
 },
});


 return res.status(402).json({
  message: 'Insufficient credits',
  creditsLeft: 0,
  chargedCost: 0,
  hasEnoughCredits: false,
 });
}

 // ─────────────────────────────────────────────────────────────────────────
    const agentEndpoint = `https://${SNOWFLAKE_CONFIG.host}/api/v2/databases/${SNOWFLAKE_CONFIG.database}/schemas/${SNOWFLAKE_CONFIG.schema}/agents/${agentName}:run`;

    // HTTP/1.1 via raw https — avoids Snowflake GOAWAY frames that occur with HTTP/2
    const { upstreamRequest, upstreamResponse } = await postSnowflakeAgentMessage(agentEndpoint, requestBody);
    const statusCode = upstreamResponse.statusCode || 500;
    const statusMessage = upstreamResponse.statusMessage || '';

    // ── Error path ───────────────────────────────────────────────────────────
    if (statusCode < 200 || statusCode >= 300) {
      let errorBody = null;
      const contentType = upstreamResponse.headers['content-type'] || '';
      if (contentType.includes('application/json') &&
          statusCode !== HTTP_STATUS.BAD_REQUEST && statusCode !== HTTP_STATUS.UNAUTHORIZED) {
        try {
          errorBody = JSON.parse(await collectStreamBody(upstreamResponse));
        } catch { /* ignore */ }
      }

      const errorParts = buildSnowflakeErrorParts(statusCode, statusMessage, errorBody, {
        400: '💡 Tip: Check your SNOWFLAKE_DATABASE and SNOWFLAKE_SCHEMA in the backend .env file. Make sure they exist and you have access to them.',
        401: "💡 Tip: Check your SNOWFLAKE_PAT (Personal Access Token) in the backend .env file. Make sure it's valid and not expired.",
        404: '💡 Tip: Check your SNOWFLAKE_HOST in the backend .env file. Make sure it\'s correct and accessible.',
      });

      console.error('❌ Snowflake Agent API error:', statusCode, errorParts.join('\n'));
      await finishLangSmithRun(langsmithRunId, {
 error: { errorParts },
 status: statusCode,
 latencyMs: Date.now() - startTime,
 streamed: false,
 metadata: {
  credits_left: creditsLeft,
  snowflake_cost_usd: 0,
  has_enough_credits: true,
  charged_cost: chargedCost,
 },
});

      return res.status(statusCode).json({ errorParts });
    }

    // ── Request ID (header) ──────────────────────────────────────────────────
    // Used as fallback if the SSE stream doesn't contain a response.completed event.
    const snowflakeRequestId = upstreamResponse.headers['x-snowflake-request-id'] || null;
    if (snowflakeRequestId) {
      console.log(`🆔 Snowflake request ID (header): ${snowflakeRequestId}`);
    } else {
      console.warn('⚠️  No x-snowflake-request-id header — will rely on SSE event for credit lookup');
    }

    const contentType = upstreamResponse.headers['content-type'] || '';

    // ── Streaming path (SSE) ─────────────────────────────────────────────────
    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
      res.flushHeaders?.();

      console.log('📡 Streaming response from agent...');

      const decoder = new TextDecoder();
      let fullStreamText = '';

      // Guards against finalizing the LangSmith run twice — both the upstream 'end'
      // and client 'close' handlers can fire; without this flag they'd each start
      // a credit-polling loop and patch the run, risking a 409.
      let runFinalized = false;
      // Set when the client cancels mid-stream so the upstream 'error' that follows
      // our own teardown is recognised as expected and stays silent.
      let clientAborted = false;

      upstreamResponse.on('data', chunk => {
        fullStreamText += decoder.decode(chunk, { stream: true });
        if (res.writableEnded) return; // client may have cancelled
        if (!res.write(chunk)) {
          upstreamResponse.pause();
          res.once('drain', () => upstreamResponse.resume());
        }
      });

      upstreamResponse.on('end', () => {
        // response.completed SSE event carries request_id directly — more reliable than the header
        const sseRequestId = extractRequestIdFromSSE(fullStreamText);
        const finalRequestId = sseRequestId || snowflakeRequestId || null;

        console.log(`✅ Streaming complete`);
        console.log(`🆔 Request ID: ${finalRequestId || 'not found'} (source: ${sseRequestId ? 'SSE event' : snowflakeRequestId ? 'response header' : 'none'})`);

        if (!runFinalized) {
          runFinalized = true;
          const expectedSize = (fullStreamText.length * 1e-6).toFixed(4);
          const { inputTokens, outputTokens } = extractTokensFromSSE(fullStreamText);
          console.log(`🔢 Tokens — input: ${inputTokens ?? 'n/a'}, output: ${outputTokens ?? 'n/a'}`);
          if (inputTokens == null && outputTokens == null) {
            // No usage parsed — dump the tail of the stream so the token path can be confirmed
            console.log('🔍 No tokens parsed; stream tail:', fullStreamText.slice(-800));
          }
          closeRunWithCredits(langsmithRunId, {
            output: fullStreamText,
            status: statusCode,
            latencyMs: Date.now() - startTime,
            streamEndTime: new Date().toISOString(),
            requestId: finalRequestId,
            expectedSize,
            inputTokens,
            outputTokens,
            creditsLeft,
          });
        }

        // Send the LangSmith run ID to the frontend so it can submit like/dislike feedback
        if (langsmithRunId && !res.writableEnded) {
          writeSseEvent(res, 'response.run_id', { run_id: langsmithRunId });
        }

        res.end();
      });

      upstreamResponse.on('error', error => {
        // ECONNRESET/aborted after a client disconnect is expected — we tore it down ourselves
        const isAbort = clientAborted
          || error.code === 'ECONNRESET'
          || error.code === 'ECONNABORTED'
          || error.message === 'aborted'
          || error.name === 'AbortError';

        if (isAbort) {
          if (!runFinalized) {
            runFinalized = true;
            // Agent usually still completes server-side after a client abort and is billed —
            // pass the request ID through so LangSmith records credits rather than nothing.
            const finalRequestId = extractRequestIdFromSSE(fullStreamText) || snowflakeRequestId || null;
            const { inputTokens, outputTokens } = extractTokensFromSSE(fullStreamText);
            closeRunWithCredits(langsmithRunId, {
              output: fullStreamText, status: 499,
              latencyMs: Date.now() - startTime,
              streamEndTime: new Date().toISOString(),
              requestId: finalRequestId,
              inputTokens,
              outputTokens,
              creditsLeft,
            });
          }
          return;
        }

        console.error('❌ Stream error:', error);
        if (!runFinalized) {
          runFinalized = true;
          finishLangSmithRun(langsmithRunId, {
            error: { message: error.message }, status: 500,
            latencyMs: Date.now() - startTime, streamed: true,
          });
        }
        // Headers already flushed — emit a structured SSE error event so the client
        // gets a usable signal rather than a silently truncated stream.
        if (!res.writableEnded) {
          writeSseEvent(res, 'response.error', {
            code: error.code || 'STREAM_INTERRUPTED',
            message: 'Snowflake stream was interrupted before completion. Please retry the question. If this continues, simplify the request or try again later.',
          });
          res.end();
        }
      });

      // upstreamResponse.complete is true on a normal finish, so this only fires on
      // an actual client disconnect — tear down the upstream request and close the run.
      res.on('close', () => {
        if (upstreamResponse.complete) return;

        clientAborted = true;
        console.log('🚫 Request cancelled by client — tearing down upstream Snowflake request');
        upstreamRequest.destroy();

        if (runFinalized) return;
        runFinalized = true;
        // Agent is billed even after client disconnect — capture request ID for LangSmith
        const finalRequestId = extractRequestIdFromSSE(fullStreamText) || snowflakeRequestId || null;
        const { inputTokens, outputTokens } = extractTokensFromSSE(fullStreamText);
        closeRunWithCredits(langsmithRunId, {
          output: fullStreamText,
          status: 499, // 499 = Client Closed Request (nginx convention)
          latencyMs: Date.now() - startTime,
          streamEndTime: new Date().toISOString(),
          requestId: finalRequestId,
          inputTokens,
          outputTokens,
          creditsLeft,
        });
      });

    // ── Non-streaming path ───────────────────────────────────────────────────
    } else {
      const data = JSON.parse(await collectStreamBody(upstreamResponse));
      console.log('✅ Received non-streaming response from agent');
      await finishLangSmithRun(langsmithRunId, {
 output: data,
 status: statusCode,
 latencyMs: Date.now() - startTime,
 streamed: false,
 metadata: {
  credits_left: creditsLeft,
  snowflake_cost_usd: 0,
  has_enough_credits: true,
  charged_cost: chargedCost,
 },
});

      res.json(data);
    }

  } catch (error) {
 console.error('❌ Error sending message to agent:', error.message);

 await finishLangSmithRun(langsmithRunId, {
  error: sanitizeError(error),
  status: 500,
  latencyMs: Date.now() - startTime,
  streamed: false,
  metadata: {
   credits_left: 0,
   snowflake_cost_usd: 0,
   has_enough_credits: false,
   charged_cost: 0,
  },
 });



    if (!res.headersSent) {
      // Raw https exposes connection failures on error.code; fetch puts them on error.cause.code
      const code = error.code || error.cause?.code;
      if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
        const errorParts = [
          ERROR_MESSAGES.ERROR_PREFIX,
          'Failed to connect to Snowflake',
          "💡 Tip: Check your SNOWFLAKE_HOST in the backend .env file. Make sure it's correct and accessible (format: account.snowflakecomputing.com)",
        ];
        return res.status(503).json({ errorParts });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
});

// ============================================================================
// Static File Serving (Production)
// ============================================================================

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../build');
  app.use(express.static(buildPath));
  // SPA fallback via bare middleware — app.get('*') is rejected by path-to-regexp v8 (Express 5).
  // Only intercepts GETs so unmatched /api routes still 404.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Not found', message: 'The requested endpoint does not exist' });
  });
}

// Global error handler — catches anything that slips past route-level try/catch
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: sanitizeError(err) });
});

// ============================================================================
// Server Startup
// ============================================================================

const server = app.listen(PORT, () => {
  console.log('\n🚀 Secure Snowflake Proxy Server Started');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏔️  Snowflake Host: ${SNOWFLAKE_CONFIG.host}`);
  console.log(`📊 Database: ${SNOWFLAKE_CONFIG.database}`);
  console.log(`📁 Schema: ${SNOWFLAKE_CONFIG.schema}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log('Available endpoints:');
  console.log('  GET  /health                          - Health check');
  console.log('  GET  /api/agents                      - List all agents');
  console.log('  GET  /api/agents/:agentName           - Get agent details');
  console.log('  POST /api/agents/:agentName/messages  - Send message to agent (streaming)');
  console.log('\n✨ Ready to accept requests!\n');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Stops accepting new connections and lets in-flight requests finish.
// Note: pending credit-polling timers (up to +300s) are not awaited —
// on a redeploy those LangSmith runs will close without credit data.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.warn('⚠️ Forced shutdown — connections did not drain in time');
    process.exit(1);
  }, 10_000);
  forceExit.unref(); // don't keep the event loop alive

  server.close((err) => {
    clearTimeout(forceExit);
    if (err) { console.error('❌ Error during shutdown:', err.message); process.exit(1); }
    console.log('✅ All connections closed, exiting.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
