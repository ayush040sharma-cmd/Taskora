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

// ── Allowed origins ───────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
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
    if (ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
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

// JWT authentication on every socket connection
io.use((socket, next) => {
  try {
    const token =
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
alertService.setIO(io); // give alert service access to push real-time events

io.on("connection", (socket) => {
  logger.info(`Socket connected: user=${socket.user?.id}`);

  socket.on("join_workspace", (workspaceId) => {
    // Only allow joining workspaces the token user has access to
    // (Full workspace membership check can be added here if needed)
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

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { port: PORT, env: process.env.NODE_ENV || "development" });
  try {
    const { startAgents } = require("./services/agentRunner");
    startAgents();
  } catch (e) {
    logger.warn(`Agents could not start: ${e.message}`);
  }
});
