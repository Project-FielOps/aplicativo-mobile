import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchTarget } from '../theme/tokens';
import { type } from '../theme/typography';

/**
 * Seleção de um item de uma lista, no padrão dos campos do formulário.
 *
 * Abre uma folha sobre a tela em vez de um menu suspenso: o alvo de toque
 * continua respeitando os 44px do sistema de design, e a lista cabe mesmo com
 * muitos cadastros.
 */

export interface Option {
  value: string;
  label: string;
  /** Linha secundária, para desambiguar homônimos. */
  detail?: string | null;
}

export function Picker({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  emptyHint,
}: {
  label: string;
  placeholder: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Texto quando não há o que escolher — explica o que falta preencher antes. */
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  const blocked = disabled || options.length === 0;

  return (
    <View style={styles.field}>
      <Text style={[type.labelCaps, styles.fieldLabel]}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={blocked}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.control,
          blocked && styles.controlDisabled,
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text
          style={[type.bodyLg, { flex: 1, color: selected ? colors.onSurface : colors.outline }]}
          numberOfLines={1}
        >
          {selected ? selected.label : blocked && emptyHint ? emptyHint : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.onSurfaceVariant} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={type.titleMd}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                onPress={() => setOpen(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <ScrollView>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyLg}>{option.label}</Text>
                      {option.detail ? (
                        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={20} color={colors.primaryContainer} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Escolha entre poucas opções fixas, lado a lado — prioridade, por exemplo. */
export function SegmentedPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={[type.labelCaps, styles.fieldLabel]}>{label}</Text>
      <View style={styles.segments}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.segment,
                isSelected && styles.segmentSelected,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text
                style={[
                  type.bodyMdMedium,
                  { color: isSelected ? '#ffffff' : colors.onSurfaceVariant },
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  fieldLabel: { marginBottom: 2 },
  control: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  controlDisabled: { opacity: 0.55 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  optionPressed: { backgroundColor: colors.surfaceContainerLow },

  segments: { flexDirection: 'row', gap: 4 },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
