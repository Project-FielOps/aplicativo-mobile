import { API_BASE_URL } from './config';
import type { ApiError, TokenResponse } from './types';

/**
 * Cliente HTTP da FieldOps API.
 *
 * O access token vive em memória; o refresh token fica no SecureStore (ver
 * `src/auth/session.ts`). Ao receber 401 o cliente renova **uma vez** e repete a
 * requisição original — a renovação acontece aqui dentro, antes de qualquer
 * tratamento de erro de tela, para que o usuário não seja derrubado para o login
 * quando a sessão ainda podia ser salva.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Falha de rede — o dispositivo está offline ou a API está inalcançável. */
export class OfflineError extends Error {
  constructor(message = 'Sem conexão com o servidor.') {
    super(message);
    this.name = 'OfflineError';
  }
}

type Tokens = { accessToken: string; refreshToken: string };

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokensRenewed: ((tokens: Tokens) => void) | null = null;
let onSessionLost: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setTokens(tokens: Tokens | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function configureClient(handlers: {
  onTokensRenewed: (tokens: Tokens) => void;
  onSessionLost: () => void;
}): void {
  onTokensRenewed = handlers.onTokensRenewed;
  onSessionLost = handlers.onSessionLost;
}

async function parseError(response: Response): Promise<HttpError> {
  let body: ApiError | null = null;
  try {
    body = (await response.json()) as ApiError;
  } catch {
    body = null;
  }
  return new HttpError(response.status, body, body?.message ?? `Erro ${response.status}`);
}

/** Renova o par de tokens. Concorrentes compartilham a mesma tentativa. */
async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  if (!refreshToken) return false;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const tokens = (await response.json()) as TokenResponse;
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      onTokensRenewed?.({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Corpo multipart pronto; quando presente, `body` é ignorado. */
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Rotas de autenticação não levam Bearer nem disparam renovação. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, query, anonymous = false } = options;
  const url = buildUrl(path, query);

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (!anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (form) {
      // Deixamos o fetch definir o boundary do multipart.
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } catch {
      throw new OfflineError();
    }
  };

  let response = await send();

  if (response.status === 401 && !anonymous) {
    const renewed = await refreshTokens();
    if (renewed) {
      response = await send();
    } else {
      onSessionLost?.();
      throw await parseError(response);
    }
  }

  if (!response.ok) throw await parseError(response);

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
