import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from './secureStorage';
import { configureClient, setTokens } from '../api/client';
import { auth as authApi } from '../api/endpoints';
import type { UserResponse } from '../api/types';

/**
 * Sessão do técnico.
 *
 * O refresh token vai para o SecureStore (Keychain/Keystore), não para o
 * AsyncStorage: o aparelho é levado a campo e pode ser perdido, então o segredo
 * de longa duração fica sob a proteção do sistema. O access token só existe em
 * memória e é renovado pelo cliente HTTP quando expira.
 */

const REFRESH_KEY = 'fieldops.refreshToken';
const USER_KEY = 'fieldops.user';

interface AuthState {
  user: UserResponse | null;
  /** `true` enquanto tentamos restaurar a sessão salva na abertura do app. */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** O app é só do técnico: administração, agendamento e revisão vivem na interface web. */
export class RoleNotAllowedError extends Error {
  constructor() {
    super('Este aplicativo é exclusivo para técnicos. Use a interface administrativa web.');
    this.name = 'RoleNotAllowedError';
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [restoring, setRestoring] = useState(true);

  const clearSession = useCallback(async () => {
    setTokens(null);
    setUser(null);
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
  }, []);

  // O cliente HTTP avisa quando renovou os tokens ou quando a sessão morreu.
  useEffect(() => {
    configureClient({
      onTokensRenewed: ({ refreshToken }) => {
        SecureStore.setItemAsync(REFRESH_KEY, refreshToken).catch(() => undefined);
      },
      onSessionLost: () => {
        void clearSession();
      },
    });
  }, [clearSession]);

  // Restaura a sessão na abertura, para o técnico não relogar a cada turno.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedRefresh = await SecureStore.getItemAsync(REFRESH_KEY);
        const savedUser = await SecureStore.getItemAsync(USER_KEY);
        if (!savedRefresh) return;

        // Sem access token, a primeira chamada dispara a renovação no cliente.
        setTokens({ accessToken: '', refreshToken: savedRefresh });

        if (savedUser && !cancelled) {
          setUser(JSON.parse(savedUser) as UserResponse);
        }

        const fresh = await authApi.me();
        if (fresh.role !== 'TECHNICIAN') throw new RoleNotAllowedError();
        if (!cancelled) {
          setUser(fresh);
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh));
        }
      } catch {
        if (!cancelled) await clearSession();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email.trim(), password);
    setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);

    const me = await authApi.me();
    if (me.role !== 'TECHNICIAN') {
      await authApi.logout(tokens.refreshToken).catch(() => undefined);
      await clearSession();
      throw new RoleNotAllowedError();
    }
    setUser(me);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(me));
  }, [clearSession]);

  const signOut = useCallback(async () => {
    const savedRefresh = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
    if (savedRefresh) {
      // Melhor esforço: revogar no servidor não pode impedir o logout local.
      await authApi.logout(savedRefresh).catch(() => undefined);
    }
    await clearSession();
  }, [clearSession]);

  const value = useMemo<AuthState>(
    () => ({ user, restoring, signIn, signOut }),
    [user, restoring, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
