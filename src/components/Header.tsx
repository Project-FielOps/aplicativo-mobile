import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useSync } from '../offline/SyncContext';
import { colors, radius, spacing, touchTarget } from '../theme/tokens';
import { type } from '../theme/typography';
import { StatusDot } from './ui';

function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (parts[0][0] + last).toUpperCase();
}

/** Avatar com iniciais — o backend não serve foto de perfil. */
export function Avatar({ size = 40 }: { size?: number }) {
  const { user } = useAuth();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: radius.full },
      ]}
    >
      <Text style={[type.bodyMdMedium, { color: '#ffffff', fontSize: size * 0.34 }]}>
        {initials(user?.name)}
      </Text>
    </View>
  );
}

/**
 * Cabeçalho de marca das telas de aba: logo, nome e o indicador de rede que o
 * protótipo chama de "Offline Ready".
 */
export function BrandHeader() {
  const { online, pending } = useSync();

  return (
    <View style={styles.header}>
      <View style={styles.mark}>
        <Ionicons name="shield-checkmark" size={20} color="#ffffff" />
      </View>
      <View style={styles.brandText}>
        <Text style={type.titleMd}>FieldOps</Text>
        <View style={styles.statusRow}>
          <StatusDot ok={online} />
          <Text style={type.labelCaps}>
            {online ? 'Conectado' : `Offline${pending.length ? ` · ${pending.length} na fila` : ''}`}
          </Text>
        </View>
      </View>
      <View style={styles.spacer} />
      <Avatar />
    </View>
  );
}

/** Cabeçalho de tela interna: voltar, título e avatar. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))}
        hitSlop={12}
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
      </Pressable>
      <View style={styles.headerTitle}>
        <Text style={type.titleMd} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Avatar size={36} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  spacer: { flex: 1 },
  avatar: {
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: touchTarget,
    height: touchTarget,
    marginLeft: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1 },
});
