require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Socket.io setup ───────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Store io instance so routes can emit events
app.set("io", io);

io.on("connection", (socket) => {
  // Client joins a workspace room on connect
  socket.on("join_workspace", (workspaceId) => {
    socket.join(`workspace:${workspaceId}`);
  });

  socket.on("leave_workspace", (workspaceId) => {
    socket.leave(`workspace:${workspaceId}`);
  });

  socket.on("disconnect", () => {});
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
app.use("/api/channels",     require("./routes/channels"));

app.get("/health", async (req, res) => {
  let dbStatus = "ok";
  try {
    const pool = require("./db");
    await pool.query("SELECT 1");
  } catch {
    dbStatus = "error";
  }
  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    service: "taskora-api",
    version: "1.0.0",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start background agents (Phase 15)
  try {
    const { startAgents } = require("./services/agentRunner");
    startAgents();
  } catch (e) {
    console.warn("Agents could not start:", e.message);
  }
});
