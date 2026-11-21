/**
 * Log estruturado em JSON (uma linha por evento), com `request_id` sempre
 * presente para correlacionar redirect -> fila -> CAPI nos logs do
 * Cloudflare. Mantido enxuto de proposito (item 46: "evitar logs gigantes").
 */
export interface LogFields {
  request_id: string;
  event: string;
  [key: string]: unknown;
}

function emit(level: "info" | "warn" | "error", fields: LogFields) {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};

export function newRequestId(): string {
  return crypto.randomUUID();
}
