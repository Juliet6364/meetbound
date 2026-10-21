// Shared helpers for Meetbound AI serverless functions (Vercel, Node 18+).
// Uses plain fetch: no npm packages needed.
const crypto = require("crypto");

const ENV = {
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseAnon: process.env.SUPABASE_ANON_KEY || "",
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  model: process.env.CLAUDE_MODEL || "claude-haiku-5-5",
  rzpKeyId: process.env.RAZORPAY_KEY_ID || "",
  rzpSecret: process.env.RAZORPAY_KEY_SECRET || "",
  rzpWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  plans: {
    p199: process.env.RAZORPAY_PLAN_199 || "",
    p299: process.env.RAZORPAY_PLAN_299 || "",
    p399: process.env.RAZORPAY_PLAN_399 || ""
  }
};

const PLANS = {
  p199: { name: "Starter", price: 199, limit: 50 },
  p299: { name: "Pro", price: 299, limit: 150 },
  p399: { name: "Power", price: 399, limit: 400 }
};

const ready = () => ({
  auth: !!(ENV.supabaseUrl && ENV.supabaseAnon && ENV.supabaseService),
  ai: !!ENV.anthropicKey,
  payments: !!(ENV.rzpKeyId && ENV.rzpSecret && ENV.plans.p199 && ENV.plans.p299 && ENV.plans.p399)
});

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

function fail(res, status, code, message) {
  send(res, status, { code, message });
}

async function readRaw(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req);
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// Returns {id, email} for a valid Supabase access token, or null.
async function getUser(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || !ready().auth) return null;
  const r = await fetch(ENV.supabaseUrl + "/auth/v1/user", {
    headers: { apikey: ENV.supabaseAnon, authorization: "Bearer " + token }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email || "" } : null;
}

// Calls a Postgres function through Supabase's REST API with the service key.
async function rpc(fn, args) {
  const r = await fetch(ENV.supabaseUrl + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      apikey: ENV.supabaseService,
      authorization: "Bearer " + ENV.supabaseService,
      "content-type": "application/json"
    },
    body: JSON.stringify(args)
  });
  const text = await r.text();
  if (!r.ok) throw new Error("rpc " + fn + " failed: " + r.status + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

async function razorpay(method, path, body) {
  const auth = Buffer.from(ENV.rzpKeyId + ":" + ENV.rzpSecret).toString("base64");
  const r = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    headers: { authorization: "Basic " + auth, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("razorpay " + path + " failed: " + r.status + " " + JSON.stringify(data).slice(0, 300));
  return data;
}

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function planFromRazorpayId(planId) {
  return Object.keys(ENV.plans).find(k => ENV.plans[k] && ENV.plans[k] === planId) || null;
}

module.exports = { ENV, PLANS, ready, send, fail, readRaw, readJson, getUser, rpc, razorpay, hmacHex, safeEqual, planFromRazorpayId };
