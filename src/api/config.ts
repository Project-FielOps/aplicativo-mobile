import Constants from 'expo-constants';

/**
 * Descobre onde a API está.
 *
 * No Expo Go o app roda no celular, então `localhost` aponta para o próprio
 * aparelho e nunca alcançaria o backend na máquina de desenvolvimento. O host
 * correto é justamente o que o celular já usou para achar o Metro, exposto pelo
 * Expo em `hostUri` — assim o app funciona em qualquer rede sem editar código.
 *
 * Para apontar para outro ambiente, defina `EXPO_PUBLIC_API_URL` (a URL completa,
 * incluindo `/api/v1`).
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:8080/api/v1`;

  // Último recurso: emulador rodando na própria máquina.
  return 'http://localhost:8080/api/v1';
}

export const API_BASE_URL = resolveBaseUrl();

/** Host legível, para a tela de perfil mostrar contra qual ambiente está falando. */
export const API_HOST = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '');
