require("dotenv").config();
const express  = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors     = require("cors");
const helmet      = require("helmet");
const rateLimit   = require("express-rate-limit");
const jwt         = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const logger       = require("./utils/logger");
const firewall     = require("./middleware/firewall");
const alertService = require("./services/alertService");
const planEnforce  = require("./middleware/planEnforce");

const app        = express();
const httpServer = createServer(app);
const PORT       = process.env.PORT || 3001;

// Trust the first proxy hop (Render's load balancer) so req.ip is the real
// client IP and rate-limiters per IP work correctly.
app.set("trust proxy", 1);

// ── Allowed origins ───────────────────────────────────────────────────────────
// FRONTEND_URL  — primary production frontend (Vercel deployment URL)
// ADDITIONAL_ORIGINS — comma-separated extra origins (preview deploys, staging)
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ...(process.env.ADDITIONAL_ORIGINS
    ? process.env.ADDITIONAL_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
    : []),
];

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedded resources (charts, images)
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],  // Vite dev needs this
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https:"],
      connectSrc:  ["'self'", "https:", "wss:"],
      fontSrc:     ["'self'", "https:", "data:"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Same-origin / server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    logger.warn(`CORS blocked origin: ${origin}`);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ["Set-Cookie"],
}));

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  req._startTime = Date.now();
  next();
});
app.use((req, res, next) => {
  res.on("finish", () => {
    const ms = Date.now() - (req._startTime || Date.now());
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`, {
      method:  req.method,
      url:     req.originalUrl,
      status:  res.statusCode,
      ms,
      ip:      req.ip,
    });
  });
  next();
});

// ── Global rate limiting ──────────────────────────────────────────────────────
// Unauthenticated routes: 60 req / 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: (req) => req.path === "/health",
});
app.use("/api", globalLimiter);

// ── Firewall — threat detection on every API request ─────────────────────────
app.use("/api", firewall);

// ── Plan enforcement — gate pro/enterprise routes ─────────────────────────────
app.use("/api", planEnforce);

// ── Socket.io setup ───────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// JWT authentication on every socket connection.
// Prefers the httpOnly cookie (immune to XSS), falls back to explicit auth token
// (needed for OAuth callbacks and environments where cookies aren't forwarded).
io.use((socket, next) => {
  try {
    // Parse httpOnly cookie from the handshake request headers
    const rawCookie = socket.handshake.headers?.cookie || "";
    const cookieToken = rawCookie
      .split(";")
      .map(c => c.trim())
      .find(c => c.startsWith("taskora_token="))
      ?.slice("taskora_token=".length);

    const token =
      cookieToken ||
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Socket: authentication required"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error("Socket: invalid or expired token"));
  }
});

app.set("io", io);
alertService.setIO(io);
require("./services/notificationService").setIO(io);

const approvalEngine = require("./routes/approval-engine");
approvalEngine.setIO(io);

io.on("connection", (socket) => {
  logger.info(`Socket connected: user=${socket.user?.id}`);

  // Auto-join personal room so targeted notifications arrive instantly
  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);
  }

  socket.on("join_workspace", (workspaceId) => {
    socket.join(`workspace:${workspaceId}`);
  });

  socket.on("leave_workspace", (workspaceId) => {
    socket.leave(`workspace:${workspaceId}`);
  });

  socket.on("disconnect", () => {
    logger.info(`Socket disconnected: user=${socket.user?.id}`);
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/auth",          require("./routes/oauth"));
app.use("/api/workspaces",    require("./routes/workspaces"));
app.use("/api/tasks",         require("./routes/tasks"));
app.use("/api/sprints",       require("./routes/sprints"));
app.use("/api/workload",      require("./routes/workload"));
app.use("/api/capacity",      require("./routes/capacity"));
app.use("/api/approvals",     require("./routes/approvals"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/simulate",      require("./routes/simulate"));
app.use("/api/audit",         require("./routes/audit"));
app.use("/api/members",       require("./routes/members"));
app.use("/api/comments",      require("./routes/comments"));
app.use("/api/subtasks",      require("./routes/subtasks"));
app.use("/api/effort",        require("./routes/effort"));
app.use("/api/calendar",      require("./routes/calendar"));
app.use("/api/ai",            require("./routes/ai"));
app.use("/api/integrations",  require("./routes/integrations"));
app.use("/api/nlquery",       require("./routes/nlquery"));
app.use("/api/channels",      require("./routes/channels"));
app.use("/api/personal",      require("./routes/personal"));
app.use("/api/jarvis",        require("./routes/jarvis"));
app.use("/api/firewall",      require("./routes/firewall"));
app.use("/api/admin",         require("./routes/admin"));
app.use("/api/payments",      require("./routes/payments"));
if (process.env.NODE_ENV !== "production") {
  app.use("/api/seed", require("./routes/seed"));
}
app.use("/api/roles",         require("./routes/roles"));
app.use("/api/user-mgmt",     require("./routes/user-management"));
app.use("/api/approvals-engine", approvalEngine.router);
app.use("/api/teams",         require("./routes/teams"));
app.use("/api/import",        require("./routes/import"));
app.use("/api/analytics",     require("./routes/analytics"));

// ── System info (no auth — read-only OS stats, no secrets exposed) ───────────
app.get("/sysinfo", (req, res) => {
  const os = require("os");
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const usedMem  = totalMem - freeMem;
  const mem = process.memoryUsage();

  res.json({
    platform:    os.platform(),
    arch:        os.arch(),
    node_version: process.version,
    cpu: {
      model:       cpus[0]?.model || "unknown",
      speed_mhz:   cpus[0]?.speed || 0,
      logical_cores: cpus.length,
      times:       cpus.reduce((acc, c) => ({
        user:   acc.user   + c.times.user,
        sys:    acc.sys    + c.times.sys,
        idle:   acc.idle   + c.times.idle,
        irq:    acc.irq    + c.times.irq,
      }), { user: 0, sys: 0, idle: 0, irq: 0 }),
    },
    memory: {
      total_mb:    +(totalMem  / 1024 / 1024).toFixed(1),
      used_mb:     +(usedMem   / 1024 / 1024).toFixed(1),
      free_mb:     +(freeMem   / 1024 / 1024).toFixed(1),
      used_pct:    +((usedMem / totalMem) * 100).toFixed(1),
      process: {
        rss_mb:          +(mem.rss          / 1024 / 1024).toFixed(1),
        heap_used_mb:    +(mem.heapUsed     / 1024 / 1024).toFixed(1),
        heap_total_mb:   +(mem.heapTotal    / 1024 / 1024).toFixed(1),
        external_mb:     +(mem.external     / 1024 / 1024).toFixed(1),
      },
    },
    load_avg_1m:  os.loadavg()[0].toFixed(3),
    load_avg_5m:  os.loadavg()[1].toFixed(3),
    load_avg_15m: os.loadavg()[2].toFixed(3),
    uptime: {
      system_sec:  Math.round(os.uptime()),
      process_sec: Math.round(process.uptime()),
    },
    env: process.env.NODE_ENV || "development",
    pid: process.pid,
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  let dbStatus = "ok";
  try {
    const pool = require("./db");
    await pool.query("SELECT 1");
  } catch {
    dbStatus = "error";
  }
  res.json({
    status:    dbStatus === "ok" ? "ok" : "degraded",
    service:   "taskora-api",
    version:   "1.0.0",
    database:  dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// ── 404 + global error handler ────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : "Internal server error";
  logger.error(`Unhandled error: ${err.message}`, {
    stack:  err.stack,
    method: req.method,
    url:    req.originalUrl,
    status,
  });
  res.status(status).json({ message });
});

// ── Process-level crash guards ────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down gracefully", {
    message: err.message,
    stack:   err.stack,
  });
  httpServer.close(() => process.exit(1));
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — closing server");
  httpServer.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

// ── Seed sidebar permissions into permissions_catalog (idempotent) ────────────
async function seedSidebarPermissions() {
  const pool = require("./db");
  try {
    await pool.query(`
      INSERT INTO permissions_catalog (key, module, action, label) VALUES
        ('sidebar:manager',    'sidebar_access', 'view', 'Manager Dashboard'),
        ('sidebar:workload',   'sidebar_access', 'view', 'Team Workload'),
        ('sidebar:members',    'sidebar_access', 'view', 'Members'),
        ('sidebar:approvals',  'sidebar_access', 'view', 'Approvals'),
        ('sidebar:ai-risk',    'sidebar_access', 'view', 'AI Risk Heatmap'),
        ('sidebar:analytics',  'sidebar_access', 'view', 'Analytics'),
        ('sidebar:simulation', 'sidebar_access', 'view', 'What-If Simulation')
      ON CONFLICT (key) DO NOTHING
    `);
  } catch (e) {
    logger.warn(`Sidebar permission seed skipped: ${e.message}`);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV || "development" });
  seedSidebarPermissions();
  try {
    const { startAgents } = require("./services/agentRunner");
    startAgents();
  } catch (e) {
    logger.warn(`Agents could not start: ${e.message}`);
  }
});
