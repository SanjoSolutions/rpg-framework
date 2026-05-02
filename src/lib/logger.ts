import pino from "pino"

const isDev = process.env.NODE_ENV === "development"

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
    : undefined,
})

export function getLogger(bindings: Record<string, unknown> = {}) {
  return baseLogger.child(bindings)
}
