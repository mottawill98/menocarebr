const DEFAULT_VERSION = "v21.0";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

export function getGraphBaseUrl(): string {
  const base = getEnv("META_GRAPH_BASE_URL", "https://graph.facebook.com");
  const version = getEnv("META_GRAPH_API_VERSION", DEFAULT_VERSION);
  return `${base}/${version}`;
}

function getToken(): string {
  return getEnv("META_ACCESS_TOKEN");
}

export interface GraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaGraphError extends Error {
  status: number;
  payload: GraphErrorPayload;

  constructor(status: number, payload: GraphErrorPayload) {
    super(payload?.error?.message || `Erro na Graph API (HTTP ${status})`);
    this.name = "MetaGraphError";
    this.status = status;
    this.payload = payload;
  }
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return false;
  const e = err.payload?.error;
  if (!e) return false;
  // code 2 = "unknown/temporary error", subcodes 1504043/1504044 = erro intermitente da Meta.
  return e.code === 2 || e.error_subcode === 1504043 || e.error_subcode === 1504044;
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof MetaGraphError)) return false;
  const e = err.payload?.error;
  if (!e) return false;
  // code 17 = "User request limit reached" (throttling da conta de anúncios / BUC).
  // code 4 / 32 / 613 = variações de limite de taxa da própria app/usuário.
  return e.code === 17 || e.code === 4 || e.code === 32 || e.code === 613;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Faz uma chamada GET à Graph API. O token nunca é logado nem incluído
 * em erros lançados — apenas usado como query param na requisição.
 * Erros transitórios/intermitentes da Meta são reexecutados com backoff.
 */
export async function graphGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retries = 7
): Promise<T> {
  const url = new URL(
    path.startsWith("http") ? path : `${getGraphBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`
  );
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (!url.searchParams.has("access_token")) {
    url.searchParams.set("access_token", getToken());
  }

  const rateLimitRetries = 5;
  for (let attempt = 0; attempt <= retries + rateLimitRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const json = (await res.json()) as T & GraphErrorPayload;

      if (!res.ok || (json as GraphErrorPayload)?.error) {
        throw new MetaGraphError(res.status, json as GraphErrorPayload);
      }

      return json;
    } catch (err) {
      if (isRateLimitError(err)) {
        // Rate limit da conta de anúncios (BUC): espera bem mais longa antes de tentar de novo.
        await sleep(45_000 * (attempt + 1));
        continue;
      }
      if (attempt < retries && isTransientError(err)) {
        await sleep(Math.min(60_000, 2000 * Math.pow(1.8, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export interface GraphPagedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
}

/**
 * Busca todas as páginas de um endpoint paginado da Graph API,
 * seguindo `paging.next` até esgotar os resultados.
 */
export async function graphGetAllPages<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined;
  const currentPath = path;
  let currentParams: Record<string, string | number | undefined> | undefined = params;

  // Segurança contra loop infinito em caso de resposta inesperada da API.
  const MAX_PAGES = 500;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    pageCount += 1;
    const page: GraphPagedResponse<T> = nextUrl
      ? await graphGet<GraphPagedResponse<T>>(nextUrl)
      : await graphGet<GraphPagedResponse<T>>(currentPath, currentParams);

    if (Array.isArray(page.data)) {
      results.push(...page.data);
    }

    if (page.paging?.next) {
      nextUrl = page.paging.next;
      currentParams = undefined;
    } else {
      break;
    }
  }

  return results;
}
