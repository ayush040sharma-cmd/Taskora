require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
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

app.use("/api/auth",          require("./routes/auth"));
app.use("/api/workspaces",    require("./routes/workspaces"));
app.use("/api/tasks",         require("./routes/tasks"));
app.use("/api/sprints",       require("./routes/sprints"));
app.use("/api/workload",      require("./routes/workload"));
app.use("/api/capacity",      require("./routes/capacity"));
app.use("/api/approvals",     require("./routes/approvals"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/simulate",      require("./routes/simulate"));
app.use("/api/audit",         require("./routes/audit"));

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
