import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError, OfflineError } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** `true` quando a falha foi de rede — a tela pode oferecer o modo offline. */
  offline: boolean;
  reload: () => void;
}

export function messageFor(error: unknown): { message: string; offline: boolean } {
  if (error instanceof OfflineError) {
    return { message: 'Sem conexão com o servidor.', offline: true };
  }
  if (error instanceof HttpError) {
    if (error.status === 403) {
      return { message: 'Você não tem permissão para ver este conteúdo.', offline: false };
    }
    return { message: error.message, offline: false };
  }
  if (error instanceof Error) return { message: error.message, offline: false };
  return { message: 'Falha inesperada.', offline: false };
}

/**
 * Carregamento com recarga manual. Ignora respostas de requisições já
 * substituídas, para uma navegação rápida não sobrescrever a tela atual com
 * dados antigos.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (id !== runId.current) return;
        setData(result);
        setOffline(false);
      })
      .catch((e: unknown) => {
        if (id !== runId.current) return;
        const { message, offline: isOffline } = messageFor(e);
        setError(message);
        setOffline(isOffline);
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, offline, reload };
}
