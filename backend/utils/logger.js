const { createLogger, format, transports } = require("winston");
const { combine, timestamp, errors, json, colorize, printf } = format;

const isProduction = process.env.NODE_ENV === "production";

// Human-readable format for development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}] ${message}${stack ? `\n${stack}` : ""}${metaStr}`;
  })
);

// Structured JSON for production (Render logs, Datadog, etc.)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: isProduction ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
  ],
  // Don't crash the process on logger errors
  exitOnError: false,
});

// Convenience: log levels used throughout the app
// logger.error()  — exceptions, 500s, DB failures
// logger.warn()   — CORS blocks, rate limit hits, bad inputs
// logger.info()   — server start, agent start, user login
// logger.http()   — request/response log line
// logger.debug()  — verbose dev-only output

module.exports = logger;
