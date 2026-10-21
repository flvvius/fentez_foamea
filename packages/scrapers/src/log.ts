export type Logger = {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
};

export function createLogger(scope: string): Logger {
  const write = (level: string, message: string, data?: Record<string, unknown>) => {
    const line = JSON.stringify({ t: new Date().toISOString(), level, scope, message, ...data });
    process.stderr.write(`${line}\n`);
  };
  return {
    info: (message, data) => write("info", message, data),
    warn: (message, data) => write("warn", message, data),
    error: (message, data) => write("error", message, data),
  };
}
