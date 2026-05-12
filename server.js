const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.warn('Warning: ANTHROPIC_API_KEY is not set.');
}

const FREE_SCAN_LIMIT      = parseInt(process.env.FREE_SCAN_LIMIT      || '3',    10);
const HOURLY_RATE_LIMIT    = parseInt(process.env.HOURLY_RATE_LIMIT    || '20',   10);
const DAILY_ALERT_THRESHOLD = parseInt(process.env.DAILY_ALERT_THRESHOLD || '1000', 10);
const MAX_IMAGE_BYTES      = parseInt(process.env.MAX_IMAGE_BYTES      || String(1 * 1024 * 1024), 10); // 1MB

// ─── IN-MEMORY STORAGE ────────────────────────────────────────────────────────
// ipScanCount: { [ip: string]: number }  — total free scans used per IP (persists until server restart)
const ipScanCount = new Map();

// daily counter — resets at midnight UTC
let dailyScans     = 0;
let dailyAlertSent = false;
let lastResetDate  = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

function checkDailyReset() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    console.log(`[SnapID] Daily reset: ${dailyScans} scans on ${lastResetDate}`);
    dailyScans     = 0;
    dailyAlertSent = false;
    lastResetDate  = today;
  }
}

function incrementDailyCounter() {
  checkDailyReset();
  dailyScans++;
  if (!dailyAlertSent && dailyScans >= DAILY_ALERT_THRESHOLD) {
    dailyAlertSent = true;
    console.error(`ALERT_DAILY_LIMIT_HIT_${dailyScans} — threshold ${DAILY_ALERT_THRESHOLD} reached on ${lastResetDate}`);
  }
}

// ─── RATE LIMITER (20 req/hod/IP) ─────────────────────────────────────────────
const scanRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hodina
  max: HOURLY_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    console.warn(`[SnapID] Rate limit hit: ${req.ip}`);
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Max ${HOURLY_RATE_LIMIT} scans per hour. Try again later.`
    });
  }
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  checkDailyReset();
  res.json({
    status: 'SnapID backend running',
    dailyScans,
    dailyAlertThreshold: DAILY_ALERT_THRESHOLD
  });
});

app.post('/identify', scanRateLimiter, async (req, res) => {
  const { image, mediaType } = req.body;

  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Both image and mediaType are required.' });
  }

  // ── 1. IMAGE SIZE CAP ──────────────────────────────────────────────────────
  // base64 string length → actual bytes ≈ length * 0.75
  const estimatedBytes = Math.ceil(image.length * 0.75);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      error: 'image_too_large',
      message: `Image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit. Please resize before uploading.`,
      estimatedBytes
    });
  }

  // ── 2. FREEMIUM ENFORCEMENT (per-IP, 3 scans total) ───────────────────────
  const ip = req.ip;
  const usedScans = ipScanCount.get(ip) || 0;

  if (usedScans >= FREE_SCAN_LIMIT) {
    console.log(`[SnapID] Free limit reached: ${ip} (${usedScans} scans)`);
    return res.status(402).json({
      error: 'free_limit_reached',
      message: `Free tier limit of ${FREE_SCAN_LIMIT} scans reached.`,
      usedScans,
      upgradeUrl: 'https://snapidapp.gumroad.com/l/uzpmiz'
    });
  }

  // ── 3. CALL ANTHROPIC API (with retry on overloaded_error) ────────────────
  const MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
  const MAX_RETRIES_PER_MODEL = 2;
  const RETRY_DELAY_MS = 2000;

  const callAnthropic = async (model) => {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              {
                type: 'text',
                text: 'You are an expert identifier. Analyze this image and respond ONLY with JSON: {"name":"...","confidence":"95%","category":"...","estimated_value":"...","origin_period":"...","rarity":"...","description":"..."}'
              }
            ]
          }
        ]
      })
    });
  };

  try {
    let response;
    let lastError;

    // Try each model — Sonnet first, Haiku as fallback
    modelLoop:
    for (const model of MODELS) {
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        response = await callAnthropic(model);

        if (response.ok) {
          console.log(`[SnapID] API OK with model: ${model}`);
          break modelLoop;
        }

        const errorBody = await response.text();
        lastError = errorBody;

        const isOverloaded = response.status === 529 ||
          (response.status >= 500 && response.status < 600);

        if (!isOverloaded) {
          // Non-retryable error (auth, bad request, etc.) — fail immediately
          console.warn(`[SnapID] API non-retryable error: ${response.status}`);
          return res.status(response.status).json({ error: `Anthropic API error: ${lastError}` });
        }

        if (attempt < MAX_RETRIES_PER_MODEL) {
          const delay = RETRY_DELAY_MS;
          console.warn(`[SnapID] ${model} overloaded, retry in ${delay}ms (attempt ${attempt}/${MAX_RETRIES_PER_MODEL})`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[SnapID] ${model} overloaded after ${MAX_RETRIES_PER_MODEL} attempts, trying fallback`);
        }
      }
    }

    // All models failed
    if (!response.ok) {
      return res.status(529).json({ error: `Anthropic API error: ${lastError}` });
    }

    const data = await response.json();
    const content = data?.content?.[0]?.text || '';
    const text = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    // ── 4. INCREMENT COUNTERS (only on success) ────────────────────────────
    ipScanCount.set(ip, usedScans + 1);
    incrementDailyCounter();

    console.log(`[SnapID] Scan OK: ${ip} (${usedScans + 1}/${FREE_SCAN_LIMIT} free), daily: ${dailyScans}`);

    res.json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// ─── PRO EMAIL STORE ──────────────────────────────────────────────────────────
// proEmails: Set of verified purchaser emails (populated via Gumroad webhook)
// Resets on server restart — users re-enter email once after restart.
const proEmails = new Set();

// ─── GUMROAD WEBHOOK ──────────────────────────────────────────────────────────
// Gumroad pings this URL on every sale / cancellation.
// Set Ping URL in: gumroad.com/settings/advanced → Ping URL
app.post('/webhook', express.urlencoded({ extended: true }), (req, res) => {
  const { email, cancelled, test, product_permalink } = req.body;

  if (!email) {
    return res.status(400).send('Missing email');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Ignore test purchases in production
  if (test === 'true') {
    console.log(`[SnapID] Webhook test ping from ${normalizedEmail}, ignored`);
    return res.status(200).send('ok');
  }

  if (cancelled === 'true') {
    proEmails.delete(normalizedEmail);
    console.log(`[SnapID] Pro cancelled: ${normalizedEmail} (total: ${proEmails.size})`);
  } else {
    proEmails.add(normalizedEmail);
    console.log(`[SnapID] Pro activated: ${normalizedEmail} (total: ${proEmails.size})`);
  }

  res.status(200).send('ok');
});

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────
app.post('/verify-email', (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ valid: false, message: 'Email is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const valid = proEmails.has(normalizedEmail);

  console.log(`[SnapID] Email verify: ${normalizedEmail} → ${valid}`);
  res.json({ valid });
});

// ─── START ────────────────────────────────────────────────────────────────────
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SnapID backend running on port ${port}`));
