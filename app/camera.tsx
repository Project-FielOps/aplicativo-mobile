import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSync } from '../src/offline/SyncContext';
import { Button } from '../src/components/ui';
import { colors, radius, semantic, spacing } from '../src/theme/tokens';
import { type } from '../src/theme/typography';

/**
 * Captura de evidência fotográfica.
 *
 * A foto vai para a fila com a coordenada de onde foi tirada — é isso que
 * sustenta o laudo depois: prova que a evidência veio do local do ativo. A
 * localização é melhor esforço; sem sinal de GPS a foto ainda é registrada.
 */
export default function CameraScreen() {
  const { inspectionId, itemId } = useLocalSearchParams<{ inspectionId: string; itemId?: string }>();
  const router = useRouter();
  const { enqueue, online } = useSync();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [description, setDescription] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');

  const take = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (shot) setPhoto(shot);
    } finally {
      setCapturing(false);
    }
  };

  const save = async () => {
    if (!photo) return;
    setSaving(true);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        }
      } catch {
        // Sem GPS a evidência continua válida; só perde a coordenada.
      }

      // O item vai na descrição porque a API só aceita vincular evidência a uma
      // resposta já persistida (responseId), e offline ela ainda não existe.
      const tag = itemId ? `[item:${itemId}] ` : '';

      await enqueue({
        kind: 'evidence',
        inspectionId,
        photo: {
          uri: photo.uri,
          name: `evidencia-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        },
        description: `${tag}${description.trim()}`.trim() || null,
        latitude,
        longitude,
      });

      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.titleMd}>Evidência fotográfica</Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="Fechar" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.permission}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={28} color={colors.primaryContainer} />
          </View>
          <Text style={type.headlineSm}>Permissão de câmera</Text>
          <Text style={[type.bodyMd, styles.mutedCenter]}>
            As fotos comprovam a condição encontrada no ativo e ficam anexadas à inspeção.
          </Text>
          <Button title="Permitir acesso" icon="camera" onPress={() => void requestPermission()} />
        </View>
      </SafeAreaView>
    );
  }

  // --- Revisão da foto ---------------------------------------------------
  if (photo) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={type.titleMd}>Revisar evidência</Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="Fechar" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.reviewBody}>
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />

          <TextInput
            placeholder="Legenda da evidência (opcional)"
            placeholderTextColor={colors.outline}
            value={description}
            onChangeText={setDescription}
            multiline
            style={[type.bodyMd, styles.caption]}
          />

          {!online ? (
            <View style={styles.offlineNote}>
              <Ionicons name="cloud-offline-outline" size={18} color={semantic.warning.fg} />
              <Text style={[type.bodyMd, { color: semantic.warning.fg, flex: 1 }]}>
                Offline: a foto fica no aparelho e sobe quando a rede voltar.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Button
            title="Refazer"
            variant="secondary"
            icon="refresh"
            onPress={() => setPhoto(null)}
            style={{ flex: 1 }}
          />
          <Button
            title="Usar foto"
            icon="checkmark"
            onPress={save}
            loading={saving}
            style={{ flex: 1 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Captura -----------------------------------------------------------
  return (
    <View style={styles.black}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <SafeAreaView style={styles.overlay}>
        <View style={[styles.header, styles.headerDark]}>
          <Text style={[type.titleMd, { color: '#ffffff' }]}>Evidência fotográfica</Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityLabel="Fechar" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Alternar câmera"
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            style={styles.secondaryControl}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#ffffff" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tirar foto"
            onPress={take}
            disabled={capturing}
            style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          <View style={styles.secondaryControl} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000000' },
  safe: { flex: 1, backgroundColor: colors.background },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerDark: { backgroundColor: 'rgba(0,0,0,0.35)' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  secondaryControl: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: radius.full, backgroundColor: '#ffffff' },
  reviewBody: { flex: 1, padding: spacing.gutter, gap: spacing.sm },
  preview: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surfaceContainer },
  caption: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.warning.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: semantic.info.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedCenter: { color: colors.onSurfaceVariant, textAlign: 'center' },
});
