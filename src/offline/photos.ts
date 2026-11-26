import { Directory, File, Paths } from 'expo-file-system';

/**
 * A câmera grava no cache, que o sistema pode limpar. A foto de uma evidência ainda não
 * enviada é copiada para o diretório de documentos e só é apagada depois do upload confirmado.
 */
export function persistPhoto(uri: string, operationId: string): string {
  try {
    const dir = new Directory(Paths.document, 'evidence');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, `${operationId}.jpg`);
    if (!target.exists) new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri; // web/Expo sem FS: mantém o original
  }
}

export function deletePhoto(uri: string): void {
  try {
    if (!uri.includes('/evidence/')) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* limpeza é melhor esforço */
  }
}
