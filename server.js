// Better Cloud Data API — Render-ready Express + PostgreSQL + WebSocket
// Required environment variables: DATABASE_URL, JWT_SECRET
// Optional: NODE_ENV, PORT, CORS_ORIGIN (comma-separated origins)
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"]
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: Set JWT_SECRET to a random secret of at least 32 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required. Configure a managed PostgreSQL database.");
  process.exit(1);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const rooms = new Map(); // room key => Set<WebSocket>
const rate = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 180;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function cleanName(value, field = "name", max = 64) {
  if (typeof value !== "string") throw httpError(400, "INVALID_INPUT", `${field} must be text.`);
  const out = value.trim();
  if (!out || out.length > max || /[\u0000-\u001f]/.test(out)) throw httpError(400, "INVALID_INPUT", `${field} is invalid.`);
  return out;
}
function httpError(status, code, message) {
  const e = new Error(message); e.status = status; e.code = code; return e;
}
function authToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw httpError(401, "AUTH_REQUIRED", "Log in to use this feature.");
  try { return jwt.verify(header.slice(7), JWT_SECRET); }
  catch (_) { throw httpError(401, "INVALID_TOKEN", "Session token is invalid or expired."); }
}
function optionalAuth(req, _res, next) {
  try {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) req.user = jwt.verify(h.slice(7), JWT_SECRET);
  } catch (_) {}
  next();
}
function requireAuth(req, _res, next) {
  try { req.user = authToken(req); next(); } catch (e) { next(e); }
}
function rateLimit(req, _res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) rate.set(ip, { start: now, count: 1 });
  else {
    entry.count++;
    if (entry.count > RATE_MAX) return next(httpError(429, "RATE_LIMITED", "Too many requests. Try again later."));
  }
  next();
}
app.use(rateLimit);
app.use((req, res, next) => {
  const id = String(req.headers["x-request-id"] || crypto.randomUUID()).slice(0, 100);
  res.setHeader("X-Request-ID", id);
  next();
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(24) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cloud_values (
      project_id VARCHAR(100) NOT NULL,
      key VARCHAR(128) NOT NULL,
      value TEXT NOT NULL,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY(project_id, key)
    );
    CREATE TABLE IF NOT EXISTS saves (
      project_id VARCHAR(100) NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot VARCHAR(64) NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(project_id, user_id, slot)
    );
    CREATE TABLE IF NOT EXISTS scores (
      id BIGSERIAL PRIMARY KEY,
      project_id VARCHAR(100) NOT NULL,
      leaderboard VARCHAR(64) NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS scores_board_idx ON scores(project_id, leaderboard, score DESC, created_at ASC);
    CREATE TABLE IF NOT EXISTS rooms (
      project_id VARCHAR(100) NOT NULL,
      room_id VARCHAR(64) NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(project_id, room_id)
    );
  `);
}
function projectParam(req) {
  const p = cleanName(req.params.project, "project", 100);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(p)) throw httpError(400, "INVALID_PROJECT", "Project ID contains unsupported characters.");
  return p;
}
function keyParam(req) { return cleanName(req.params.key, "key", 128); }
function slotParam(req) { return cleanName(req.params.slot, "slot", 64); }
function boardParam(req) { return cleanName(req.params.name, "leaderboard", 64); }
function signUser(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d", issuer: "better-cloud-data" });
}
function authPayload(req) {
  return { userId: req.user.sub, username: req.user.username };
}

app.get("/v1/health", (_req, res) => res.json({ ok: true, service: "better-cloud-data", version: "1.0.0" }));

app.post("/v1/auth/register", async (req, res, next) => {
  try {
    const username = cleanName(req.body.username, "username", 24);
    const password = req.body.password;
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) throw httpError(400, "INVALID_USERNAME", "Username must be 3–24 characters using letters, numbers, _ or -.");
    if (typeof password !== "string" || password.length < 10 || password.length > 200) throw httpError(400, "WEAK_PASSWORD", "Password must be between 10 and 200 characters.");
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query("INSERT INTO users(id, username, password_hash) VALUES($1,$2,$3) RETURNING id, username", [id, username, hash]);
    const user = result.rows[0];
    res.status(201).json({ token: signUser(user), user: { id: user.id, username: user.username } });
  } catch (e) {
    if (e.code === "23505") return next(httpError(409, "USERNAME_TAKEN", "That username is already taken."));
    next(e);
  }
});
app.post("/v1/auth/login", async (req, res, next) => {
  try {
    const username = cleanName(req.body.username, "username", 24);
    const password = req.body.password;
    if (typeof password !== "string") throw httpError(400, "INVALID_INPUT", "Password is required.");
    const result = await pool.query("SELECT id, username, password_hash FROM users WHERE LOWER(username)=LOWER($1)", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw httpError(401, "LOGIN_FAILED", "Invalid username or password.");
    res.json({ token: signUser(user), user: { id: user.id, username: user.username } });
  } catch (e) { next(e); }
});

app.get("/v1/projects/:project/cloud/:key", async (req, res, next) => {
  try {
    const project = projectParam(req), key = keyParam(req);
    const r = await pool.query("SELECT value, revision, updated_at FROM cloud_values WHERE project_id=$1 AND key=$2", [project, key]);
    if (!r.rowCount) throw httpError(404, "NOT_FOUND", "Cloud value does not exist.");
    res.json({ key, value: r.rows[0].value, revision: Number(r.rows[0].revision), updatedAt: r.rows[0].updated_at });
  } catch (e) { next(e); }
});
app.put("/v1/projects/:project/cloud/:key", optionalAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), key = keyParam(req);
    if (typeof req.body.value !== "string" || req.body.value.length > 4096) throw httpError(400, "INVALID_VALUE", "Value must be text up to 4096 characters.");
    const r = await pool.query(`
      INSERT INTO cloud_values(project_id,key,value,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(project_id,key) DO UPDATE SET value=EXCLUDED.value, revision=cloud_values.revision+1, updated_at=NOW(), updated_by=EXCLUDED.updated_by
      RETURNING value, revision, updated_at`, [project, key, req.body.value, req.user ? req.user.sub : null]);
    res.json({ key, value: r.rows[0].value, revision: Number(r.rows[0].revision), updatedAt: r.rows[0].updated_at });
  } catch (e) { next(e); }
});
app.delete("/v1/projects/:project/cloud/:key", async (req, res, next) => {
  try {
    const project = projectParam(req), key = keyParam(req);
    const r = await pool.query("DELETE FROM cloud_values WHERE project_id=$1 AND key=$2", [project, key]);
    if (!r.rowCount) throw httpError(404, "NOT_FOUND", "Cloud value does not exist.");
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.post("/v1/projects/:project/cloud/:key/increment", async (req, res, next) => {
  try {
    const project = projectParam(req), key = keyParam(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e12) throw httpError(400, "INVALID_AMOUNT", "Amount must be a finite number within range.");
    const r = await pool.query(`
      INSERT INTO cloud_values(project_id,key,value,revision) VALUES($1,$2,$3,1)
      ON CONFLICT(project_id,key) DO UPDATE SET
        value=(CASE WHEN cloud_values.value ~ '^-?[0-9]+([.][0-9]+)? cloud_values.value::double precision ELSE 0 END + $3)::text,
        revision=cloud_values.revision+1, updated_at=NOW()
      RETURNING value, revision, updated_at`, [project, key, amount]);
    res.json({ key, value: r.rows[0].value, revision: Number(r.rows[0].revision), updatedAt: r.rows[0].updated_at });
  } catch (e) { next(e); }
});

app.put("/v1/projects/:project/saves/:slot", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), slot = slotParam(req);
    let data = req.body.data;
    if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) { throw httpError(400, "INVALID_JSON", "Save data must be valid JSON."); } }
    const serialized = JSON.stringify(data);
    if (serialized.length > 65536) throw httpError(413, "SAVE_TOO_LARGE", "Save data exceeds 64 KB.");
    const r = await pool.query(`
      INSERT INTO saves(project_id,user_id,slot,data) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(project_id,user_id,slot) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
      RETURNING updated_at`, [project, req.user.sub, slot, serialized]);
    res.json({ ok: true, updatedAt: r.rows[0].updated_at });
  } catch (e) { next(e); }
});
app.get("/v1/projects/:project/saves/:slot", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), slot = slotParam(req);
    const r = await pool.query("SELECT data, updated_at FROM saves WHERE project_id=$1 AND user_id=$2 AND slot=$3", [project, req.user.sub, slot]);
    if (!r.rowCount) throw httpError(404, "NOT_FOUND", "Save slot does not exist.");
    res.json({ data: JSON.stringify(r.rows[0].data), updatedAt: r.rows[0].updated_at });
  } catch (e) { next(e); }
});
app.delete("/v1/projects/:project/saves/:slot", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), slot = slotParam(req);
    const r = await pool.query("DELETE FROM saves WHERE project_id=$1 AND user_id=$2 AND slot=$3", [project, req.user.sub, slot]);
    if (!r.rowCount) throw httpError(404, "NOT_FOUND", "Save slot does not exist.");
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post("/v1/projects/:project/leaderboards/:name/scores", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), name = boardParam(req), score = Number(req.body.score);
    if (!Number.isFinite(score) || Math.abs(score) > 1e15) throw httpError(400, "INVALID_SCORE", "Score must be a finite number within range.");
    await pool.query("INSERT INTO scores(project_id,leaderboard,user_id,score) VALUES($1,$2,$3,$4)", [project, name, req.user.sub, score]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
app.get("/v1/projects/:project/leaderboards/:name", async (req, res, next) => {
  try {
    const project = projectParam(req), name = boardParam(req);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const r = await pool.query(`
      SELECT DISTINCT ON (s.user_id) s.user_id, u.username, s.score, s.created_at
      FROM scores s JOIN users u ON u.id=s.user_id
      WHERE s.project_id=$1 AND s.leaderboard=$2
      ORDER BY s.user_id, s.score DESC, s.created_at ASC`, [project, name]);
    const entries = r.rows.sort((a,b) => Number(b.score) - Number(a.score)).slice(0, limit).map((row, i) => ({
      rank: i + 1, userId: row.user_id, username: row.username, score: Number(row.score), createdAt: row.created_at
    }));
    res.json({ entries });
  } catch (e) { next(e); }
});

app.post("/v1/projects/:project/rooms/:room/create", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), room = cleanName(req.params.room, "room", 64);
    await pool.query("INSERT INTO rooms(project_id,room_id,created_by) VALUES($1,$2,$3) ON CONFLICT(project_id,room_id) DO NOTHING", [project, room, req.user.sub]);
    res.status(201).json({ room });
  } catch (e) { next(e); }
});
app.post("/v1/projects/:project/rooms/:room/join", requireAuth, async (req, res, next) => {
  try {
    const project = projectParam(req), room = cleanName(req.params.room, "room", 64);
    const r = await pool.query("SELECT room_id FROM rooms WHERE project_id=$1 AND room_id=$2", [project, room]);
    if (!r.rowCount) throw httpError(404, "ROOM_NOT_FOUND", "Room does not exist. Create it first.");
    res.json({ room });
  } catch (e) { next(e); }
});

server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/v1/ws") return socket.destroy();
    const project = cleanName(url.searchParams.get("project") || "", "project", 100);
    const token = url.searchParams.get("token") || "";
    const user = jwt.verify(token, JWT_SECRET);
    wss.handleUpgrade(req, socket, head, ws => {
      ws.meta = { project, userId: user.sub, username: user.username, room: "" };
      wss.emit("connection", ws, req);
    });
  } catch (_) { socket.destroy(); }
});
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function roomKey(project, room) { return `${project}::${room}`; }
wss.on("connection", ws => {
  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return send(ws, { type: "error", code: "INVALID_JSON" }); }
    if (msg.type === "join") {
      let room;
      try { room = cleanName(msg.room, "room", 64); } catch (e) { return send(ws, { type: "error", code: e.code }); }
      const exists = await pool.query("SELECT 1 FROM rooms WHERE project_id=$1 AND room_id=$2", [ws.meta.project, room]).catch(() => ({ rowCount: 0 }));
      if (!exists.rowCount) return send(ws, { type: "error", code: "ROOM_NOT_FOUND" });
      if (ws.meta.room) removeFromRoom(ws);
      ws.meta.room = room;
      const key = roomKey(ws.meta.project, room);
      if (!rooms.has(key)) rooms.set(key, new Set());
      rooms.get(key).add(ws);
      send(ws, { type: "joined", room, playerId: ws.meta.userId });
      broadcast(key, { type: "event", event: "player-joined", data: { userId: ws.meta.userId, username: ws.meta.username }, playerId: ws.meta.userId }, ws);
    } else if (msg.type === "event") {
      if (!ws.meta.room) return send(ws, { type: "error", code: "NOT_IN_ROOM" });
      const event = cleanName(String(msg.event || ""), "event", 64);
      const data = typeof msg.data === "string" ? msg.data : JSON.stringify(msg.data ?? null);
      if (data.length > 8192) return send(ws, { type: "error", code: "EVENT_TOO_LARGE" });
      broadcast(roomKey(ws.meta.project, ws.meta.room), { type: "event", event, data, playerId: ws.meta.userId }, ws);
    }
  });
  ws.on("close", () => {
    if (ws.meta && ws.meta.room) {
      const key = roomKey(ws.meta.project, ws.meta.room);
      broadcast(key, { type: "event", event: "player-left", data: { userId: ws.meta.userId }, playerId: ws.meta.userId }, ws);
      removeFromRoom(ws);
    }
  });
});
function broadcast(key, msg, except) {
  const group = rooms.get(key);
  if (!group) return;
  for (const client of group) if (client !== except) send(client, msg);
}
function removeFromRoom(ws) {
  const key = roomKey(ws.meta.project, ws.meta.room);
  const group = rooms.get(key);
  if (group) { group.delete(ws); if (!group.size) rooms.delete(key); }
  ws.meta.room = "";
}

app.use((req, res, next) => next(httpError(404, "ROUTE_NOT_FOUND", "Route not found.")));
app.use((err, _req, res, _next) => {
  const status = Number(err.status) || (err.code === "23505" ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Internal server error." : err.message, code: err.code || "INTERNAL_ERROR" });
});

initDb().then(() => {
  server.listen(PORT, "0.0.0.0", () => console.log(`Better Cloud Data API listening on ${PORT}`));
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  server.close();
  try { await pool.end(); } finally { process.exit(0); }
});