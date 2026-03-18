export type AppEnvironment = "dev" | "test" | "prod";

export interface RuntimeConfig {
  environment: AppEnvironment;
  appVersion: string;
  enableVerboseLogging: boolean;
}

export function getRuntimeConfig(): RuntimeConfig {
  const globalNodeEnv = typeof globalThis === "object" && "process" in globalThis
    ? (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
    : undefined;
  const mode = typeof import.meta !== "undefined" && typeof import.meta.env?.MODE === "string"
    ? import.meta.env.MODE
    : globalNodeEnv ?? "dev";

  const environment: AppEnvironment = mode === "production" ? "prod" : mode === "test" ? "test" : "dev";

  return {
    environment,
    appVersion: "0.1.0",
    enableVerboseLogging: environment !== "prod"
  };
}
