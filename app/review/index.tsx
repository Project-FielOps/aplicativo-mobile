import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { review as reviewApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/Header';
import { formatRelative, label, priorityTone } from '../../src/labels';
import { colors, radius, semantic, spacing, touchTarget } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';

/**
 * Fila de revisão do supervisor.
 *
 * O que o técnico enviou espera decisão aqui. `UNDER_REVIEW` aparece junto de
 * `SUBMITTED` de propósito: uma revisão aberta e não concluída ficaria invisível
 * e a inspeção pararia sem ninguém notar.
 */
export default function ReviewQueueScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canReview = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const load = useCallback(() => reviewApi.pending(), []);
  const { data, loading, error, reload } = useAsync(load, []);
  const items = data ?? [];

  if (!canReview) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Revisão" onBack={() => router.back()} />
        <View style={styles.centered}>
          <EmptyState
            icon="lock-closed-outline"
            title="Acesso restrito"
            message="A revisão de inspeções é feita por supervisores e administradores."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Revisão"
        subtitle={items.length > 0 ? `${items.length} aguardando decisão` : undefined}
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primaryContainer} />
        }
      >
        {loading && !data ? (
          <LoadingState />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nada para revisar"
            message="Quando um técnico enviar uma inspeção, ela aparece aqui para aprovação."
          />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(`/review/${item.id}`)}
            >
              <Card accent={item.status === 'UNDER_REVIEW' ? semantic.warning.fg : colors.primary}>
                <View style={styles.badges}>
                  <Badge tone={priorityTone(item.priority)}>{label(item.priority)}</Badge>
                  <Badge tone={item.status === 'UNDER_REVIEW' ? 'warning' : 'info'}>
                    {item.status === 'UNDER_REVIEW' ? 'Em revisão' : 'Aguardando'}
                  </Badge>
                </View>

                <Text style={[type.bodyLg, { marginTop: 4 }]}>{item.title}</Text>

                <View style={styles.metaRow}>
                  <Ionicons name="person-outline" size={14} color={colors.onSurfaceVariant} />
                  <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
                    {item.technicianName ?? '—'}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
                  <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
                    {[item.siteName, item.equipmentName].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>

                <View style={styles.footer}>
                  <Text style={[type.bodyMd, styles.muted]}>
                    Agendada {formatRelative(item.scheduledFor)}
                  </Text>
                  <View style={styles.openHint}>
                    <Text style={[type.bodyMdMedium, { color: colors.primaryContainer }]}>
                      Revisar
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primaryContainer} />
                  </View>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.gutter },
  muted: { color: colors.onSurfaceVariant },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    minHeight: touchTarget - spacing.sm,
  },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
