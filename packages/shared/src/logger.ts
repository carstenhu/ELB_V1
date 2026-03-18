import { getRuntimeConfig } from "./config";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  const config = getRuntimeConfig();

  function write(level: "debug" | "info" | "warn" | "error", message: string, meta?: unknown) {
    if (level === "debug" && !config.enableVerboseLogging) {
      return;
    }

    const payload = [`[${scope}]`, message];
    if (meta !== undefined) {
      payload.push(typeof meta === "string" ? meta : JSON.stringify(meta));
    }

    console[level](payload.join(" "));
  }

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}
