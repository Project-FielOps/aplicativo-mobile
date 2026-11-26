import type { ApiError } from './types';

/** Resposta HTTP com erro da FieldOps API (corpo `ApiError` quando disponível). */
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
