import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSync } from '../../../src/offline/SyncContext';
import { Button, Card, Field } from '../../../src/components/ui';
import { ScreenHeader } from '../../../src/components/Header';
import { label, priorityTone } from '../../../src/labels';
import { colors, radius, semantic, spacing, touchTarget } from '../../../src/theme/tokens';
import { type } from '../../../src/theme/typography';
import type { NonConformitySeverity } from '../../../src/api/types';

const SEVERITIES: NonConformitySeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function NonConformityScreen() {
  const { id, itemId, title: itemTitle } = useLocalSearchParams<{
    id: string;
    itemId?: string;
    title?: string;
  }>();
  const router = useRouter();
  const { enqueue, online } = useSync();

  const [title, setTitle] = useState(itemTitle ? `NC: ${itemTitle}` : '');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<NonConformitySeverity>('HIGH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) {
      setError('Descreva a não conformidade em uma frase.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await enqueue({
        kind: 'nonConformity',
        inspectionId: id,
        body: {
          inspectionItemId: itemId ?? null,
          title: title.trim(),
          description: description.trim() || null,
          severity,
        },
      });
      Alert.alert(
        'Não conformidade registrada',
        online
          ? 'O supervisor verá o registro na revisão desta inspeção.'
          : 'Guardada no aparelho e enviada assim que a rede voltar.',
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Nova Não Conformidade" subtitle={itemTitle} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.alertBox}>
          <Ionicons name="warning-outline" size={20} color={semantic.danger.fg} />
          <Text style={[type.bodyMd, { color: semantic.danger.fg, flex: 1 }]}>
            Uma não conformidade fica registrada na auditoria e exige tratativa do supervisor. Use
            para desvios reais, não para observações.
          </Text>
        </View>

        <Card style={{ gap: spacing.md }}>
          <Field
            label="Título"
            placeholder="Ex.: Cabo de força com isolamento rompido"
            value={title}
            onChangeText={setTitle}
            error={error || undefined}
          />

          <View style={{ gap: 6 }}>
            <Text style={[type.labelCaps, { marginLeft: 2 }]}>Severidade</Text>
            <View style={styles.severityRow}>
              {SEVERITIES.map((s) => {
                const active = severity === s;
                const tone = semantic[priorityTone(s)];
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSeverity(s)}
                    style={({ pressed }) => [
                      styles.severityPill,
                      active && { backgroundColor: tone.bg, borderColor: tone.fg },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[type.bodyMdMedium, active && { color: tone.fg }]}>{label(s)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[type.labelCaps, { marginLeft: 2 }]}>Descrição</Text>
            <TextInput
              placeholder="O que foi encontrado, onde, e qual o risco associado..."
              placeholderTextColor={colors.outline}
              value={description}
              onChangeText={setDescription}
              multiline
              style={[type.bodyLg, styles.textArea]}
            />
          </View>
        </Card>

        <Button
          title="Anexar foto da evidência"
          variant="secondary"
          icon="camera-outline"
          onPress={() => router.push(`/camera?inspectionId=${id}${itemId ? `&itemId=${itemId}` : ''}`)}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Registrar Não Conformidade"
          variant="danger"
          icon="warning-outline"
          onPress={save}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  alertBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  severityRow: { flexDirection: 'row', gap: 6 },
  severityPill: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 4,
  },
  textArea: {
    minHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  footer: {
    padding: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
