import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radius, semantic, spacing, touchTarget } from '../theme/tokens';
import { type } from '../theme/typography';
import { formatDate } from '../labels';
import { currentAnswer, parseOptions, parseRules } from './answers';
import type { AnswerUpsertRequest, Conformity, ItemSnapshot } from '../api/types';

/**
 * Um item do checklist. O controle rendedizado depende do `responseType` do
 * snapshot do modelo — o app não decide o formulário, o modelo publicado decide.
 */
export function ChecklistItem({
  index,
  item,
  draft,
  onChange,
  onAddPhoto,
  onOpenNonConformity,
  photoCount,
  disabled,
}: {
  index: number;
  item: ItemSnapshot;
  draft: AnswerUpsertRequest | undefined;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  onAddPhoto: () => void;
  onOpenNonConformity: () => void;
  photoCount: number;
  disabled: boolean;
}) {
  const answer = currentAnswer(item, draft);
  const nonConforming = answer.conformity === 'NON_CONFORMING';

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={[type.bodyLg, styles.itemTitle]}>
          {index}. {item.itemTitle}
          {item.required ? <Text style={{ color: semantic.danger.fg }}> *</Text> : null}
        </Text>
        {item.responseType === 'NUMBER' ? <TargetBadge item={item} /> : null}
      </View>

      {item.itemDescription ? (
        <Text style={[type.bodyMd, styles.muted]}>{item.itemDescription}</Text>
      ) : null}

      <Control item={item} answer={answer} onChange={onChange} disabled={disabled} />

      {/* Não conforme abre o painel vermelho, onde a observação é obrigatória. */}
      {nonConforming ? (
        <View style={styles.ncPanel}>
          <Text style={[type.labelCaps, { color: semantic.danger.fg }]}>
            Detalhes da não conformidade
          </Text>

          <TextInput
            placeholder="Descreva o problema encontrado..."
            placeholderTextColor={colors.outline}
            value={answer.observation ?? ''}
            onChangeText={(text) => onChange({ observation: text })}
            editable={!disabled}
            multiline
            style={[type.bodyMd, styles.ncInput]}
          />

          <View style={styles.photoRow}>
            {photoCount > 0 ? (
              <View style={styles.photoCount}>
                <Ionicons name="images-outline" size={18} color={colors.onSurfaceVariant} />
                <Text style={type.bodyMd}>{photoCount}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={onAddPhoto}
              disabled={disabled}
              style={({ pressed }) => [styles.addPhoto, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="camera-outline" size={20} color={colors.primaryContainer} />
              <Text style={[type.bodyMdMedium, { color: colors.primaryContainer }]}>Adicionar Foto</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onOpenNonConformity}
            disabled={disabled}
            style={({ pressed }) => [styles.ncButton, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="warning-outline" size={18} color="#ffffff" />
            <Text style={[type.bodyMdMedium, { color: '#ffffff' }]}>Abrir Não Conformidade</Text>
          </Pressable>
        </View>
      ) : (
        <ObservationField answer={answer} onChange={onChange} disabled={disabled} />
      )}
    </View>
  );
}

function TargetBadge({ item }: { item: ItemSnapshot }) {
  const rules = parseRules(item.rulesJson);
  if (rules.min == null && rules.max == null) return null;
  const range =
    rules.min != null && rules.max != null
      ? `${rules.min} - ${rules.max}`
      : rules.min != null
        ? `≥ ${rules.min}`
        : `≤ ${rules.max}`;
  return (
    <View style={styles.targetBadge}>
      <Text style={[type.labelCaps, { color: colors.onSecondaryContainer }]}>
        Alvo: {range} {rules.unit ?? ''}
      </Text>
    </View>
  );
}

function Control({
  item,
  answer,
  onChange,
  disabled,
}: {
  item: ItemSnapshot;
  answer: AnswerUpsertRequest;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  switch (item.responseType) {
    case 'CONFORMITY':
      return <ConformityControl value={answer.conformity ?? null} onChange={onChange} disabled={disabled} />;
    case 'NUMBER':
      return <NumberControl item={item} answer={answer} onChange={onChange} disabled={disabled} />;
    case 'BOOLEAN':
      return <BooleanControl value={answer.valueBoolean ?? null} onChange={onChange} disabled={disabled} />;
    case 'SINGLE_CHOICE':
      return <ChoiceControl item={item} answer={answer} onChange={onChange} disabled={disabled} />;
    case 'DATE':
      return <DateControl answer={answer} onChange={onChange} disabled={disabled} />;
    case 'TEXT_SHORT':
    case 'TEXT_LONG':
      return (
        <TextInput
          placeholder={item.responseType === 'TEXT_LONG' ? 'Descreva...' : 'Digite a resposta'}
          placeholderTextColor={colors.outline}
          value={answer.valueText ?? ''}
          onChangeText={(text) => onChange({ valueText: text })}
          editable={!disabled}
          multiline={item.responseType === 'TEXT_LONG'}
          style={[
            type.bodyLg,
            styles.textInput,
            item.responseType === 'TEXT_LONG' && styles.textArea,
          ]}
        />
      );
  }
}

const CONFORMITY_CHOICES: { value: Conformity; label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'danger' | 'neutral' }[] = [
  { value: 'CONFORMING', label: 'Conforme', icon: 'checkmark', tone: 'success' },
  { value: 'NON_CONFORMING', label: 'N.C.', icon: 'close', tone: 'danger' },
  { value: 'NOT_APPLICABLE', label: 'N/A', icon: 'remove', tone: 'neutral' },
];

function ConformityControl({
  value,
  onChange,
  disabled,
}: {
  value: Conformity | null;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.pillRow}>
      {CONFORMITY_CHOICES.map((choice) => {
        const active = value === choice.value;
        const tone = semantic[choice.tone];
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={choice.label}
            disabled={disabled}
            onPress={() => onChange({ conformity: choice.value })}
            style={({ pressed }) => [
              styles.pill,
              active && { backgroundColor: tone.bg, borderColor: tone.fg },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name={choice.icon}
              size={16}
              color={active ? tone.fg : colors.onSurfaceVariant}
            />
            <Text style={[type.bodyMdMedium, active && { color: tone.fg }]}>{choice.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumberControl({
  item,
  answer,
  onChange,
  disabled,
}: {
  item: ItemSnapshot;
  answer: AnswerUpsertRequest;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  const rules = parseRules(item.rulesJson);
  const value = answer.valueNumber;
  const [text, setText] = useState(value != null ? String(value) : '');

  // Dentro da faixa-alvo o traço fica verde: leitura imediata, sem precisar
  // reler o enunciado do item.
  const inRange =
    value != null &&
    (rules.min == null || value >= rules.min) &&
    (rules.max == null || value <= rules.max) &&
    (rules.min != null || rules.max != null);

  const step = (delta: number) => {
    const next = Number(((value ?? 0) + delta).toFixed(2));
    setText(String(next));
    onChange({ valueNumber: next });
  };

  const commit = (raw: string) => {
    setText(raw);
    const normalized = raw.replace(',', '.').trim();
    if (!normalized) {
      onChange({ valueNumber: null });
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed)) onChange({ valueNumber: parsed });
  };

  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Diminuir"
        disabled={disabled}
        onPress={() => step(-0.1)}
        style={({ pressed }) => [styles.stepButton, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="remove" size={20} color={colors.onSurface} />
      </Pressable>

      <View style={styles.stepValue}>
        <TextInput
          value={text}
          onChangeText={commit}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.outlineVariant}
          style={[type.dataMono, styles.stepInput]}
        />
        {rules.unit ? <Text style={[type.bodyMd, styles.muted]}>{rules.unit}</Text> : null}
        <View
          style={[
            styles.stepUnderline,
            { backgroundColor: inRange ? semantic.success.fg : colors.outlineVariant },
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Aumentar"
        disabled={disabled}
        onPress={() => step(0.1)}
        style={({ pressed }) => [styles.stepButton, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="add" size={20} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

function BooleanControl({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.pillRow}>
      {[
        { v: true, label: 'Sim', icon: 'checkmark' as const, tone: semantic.success },
        { v: false, label: 'Não', icon: 'close' as const, tone: semantic.danger },
      ].map((choice) => {
        const active = value === choice.v;
        return (
          <Pressable
            key={String(choice.v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange({ valueBoolean: choice.v })}
            style={({ pressed }) => [
              styles.pill,
              active && { backgroundColor: choice.tone.bg, borderColor: choice.tone.fg },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name={choice.icon} size={16} color={active ? choice.tone.fg : colors.onSurfaceVariant} />
            <Text style={[type.bodyMdMedium, active && { color: choice.tone.fg }]}>{choice.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChoiceControl({
  item,
  answer,
  onChange,
  disabled,
}: {
  item: ItemSnapshot;
  answer: AnswerUpsertRequest;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  const options = parseOptions(item.optionsJson);
  if (options.length === 0) {
    return (
      <TextInput
        placeholder="Digite a resposta"
        placeholderTextColor={colors.outline}
        value={answer.valueText ?? ''}
        onChangeText={(text) => onChange({ valueText: text })}
        editable={!disabled}
        style={[type.bodyLg, styles.textInput]}
      />
    );
  }

  return (
    <View style={styles.choiceList}>
      {options.map((option) => {
        const active = answer.valueText === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange({ valueText: option })}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name={active ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={active ? colors.primaryContainer : colors.outlineVariant}
            />
            <Text style={[type.bodyLg, { flex: 1 }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DateControl({
  answer,
  onChange,
  disabled,
}: {
  answer: AnswerUpsertRequest;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const value = answer.valueDate ? new Date(`${answer.valueDate}T00:00:00`) : new Date();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.textInput, styles.dateBox, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceVariant} />
        <Text style={[type.bodyLg, !answer.valueDate && { color: colors.outline }]}>
          {answer.valueDate ? formatDate(answer.valueDate) : 'Selecionar data'}
        </Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selected) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (event.type === 'dismissed' || !selected) return;
            // A API espera LocalDate (yyyy-MM-dd), sem fuso.
            const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
            onChange({ valueDate: iso });
            if (Platform.OS === 'ios') setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ObservationField({
  answer,
  onChange,
  disabled,
}: {
  answer: AnswerUpsertRequest;
  onChange: (patch: Partial<AnswerUpsertRequest>) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(answer.observation));

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded(true)}
        disabled={disabled}
        style={styles.addNote}
        hitSlop={8}
      >
        <Ionicons name="add-circle-outline" size={16} color={colors.primaryContainer} />
        <Text style={[type.bodyMd, { color: colors.primaryContainer }]}>Adicionar observação</Text>
      </Pressable>
    );
  }

  return (
    <TextInput
      placeholder="Observação (opcional)"
      placeholderTextColor={colors.outline}
      value={answer.observation ?? ''}
      onChangeText={(text) => onChange({ observation: text })}
      editable={!disabled}
      multiline
      style={[type.bodyMd, styles.textInput, styles.noteInput]}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  itemTitle: { flex: 1 },
  muted: { color: colors.onSurfaceVariant },
  targetBadge: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: radius.base,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    maxWidth: 130,
  },
  pillRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.base },
  pill: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.xs,
  },
  textInput: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.base,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xs,
    marginTop: spacing.base,
  },
  stepButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  stepInput: { fontSize: 26, lineHeight: 34, textAlign: 'center', minWidth: 90, paddingVertical: 0 },
  stepUnderline: { height: 2, alignSelf: 'stretch', marginHorizontal: spacing.lg, borderRadius: 2 },
  choiceList: { gap: spacing.base, marginTop: spacing.base },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.sm,
  },
  choiceActive: { borderColor: colors.primaryContainer, backgroundColor: semantic.info.bg },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },
  ncPanel: {
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: semantic.danger.fg,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ncInput: {
    minHeight: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.25)',
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.xs,
    textAlignVertical: 'top',
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  photoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: touchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
  },
  addPhoto: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryContainer,
    backgroundColor: colors.surfaceContainerLowest,
  },
  ncButton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: semantic.danger.fg,
  },
});
