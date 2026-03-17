function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(msg: string, data?: unknown) {
    console.log(`[${timestamp()}] [INFO] ${msg}`, data ?? '');
  },
  warn(msg: string, data?: unknown) {
    console.warn(`[${timestamp()}] [WARN] ${msg}`, data ?? '');
  },
  error(msg: string, error?: unknown) {
    console.error(`[${timestamp()}] [ERROR] ${msg}`, error ?? '');
  },
  debug(msg: string, data?: unknown) {
    if (process.env.DEBUG) {
      console.debug(`[${timestamp()}] [DEBUG] ${msg}`, data ?? '');
    }
  },
};
