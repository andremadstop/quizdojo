import fs from 'fs';

const logPath = process.env.AUDIT_LOG_PATH || './audit.log';

export function logAudit(event, userId = null, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    userId,
    meta
  };
  fs.appendFile(logPath, JSON.stringify(entry) + '\n', () => {});
}
