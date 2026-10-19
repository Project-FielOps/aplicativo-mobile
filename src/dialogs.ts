import { Alert, Platform } from 'react-native';

/**
 * Diálogos que funcionam no aparelho e no navegador.
 *
 * O `Alert` do React Native não existe no React Native Web: a chamada não
 * lança, simplesmente nada aparece — e um `Alert.alert` com botões vira um
 * caminho sem saída, porque o `onPress` de confirmação nunca roda. Como o app
 * é aberto no navegador em desenvolvimento e em demonstração, aqui os dois
 * casos passam pelo diálogo nativo do navegador.
 */

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirm(options: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', destructive } = options;

  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
