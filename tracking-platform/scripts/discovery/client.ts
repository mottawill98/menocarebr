const BASE_URL = process.env.MCP_API_URL;
const API_KEY = process.env.MCP_API_KEY;

if (!BASE_URL || !API_KEY) {
  throw new Error("MCP_API_URL e MCP_API_KEY sao obrigatorias (ver .env.example)");
}

export async function mcpGet<T = unknown>(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${url.pathname}${url.search} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
