/**
 * FieldOps Precision System — tokens.
 *
 * Porte fiel de `fieldops_precision_system/DESIGN.md`, o mesmo sistema usado
 * pela interface administrativa web. Estética Ultra-Modern Minimalism:
 * autoridade técnica, muito respiro, baixa carga cognitiva para quem opera em
 * campo. Mudar a marca é mudar este arquivo.
 */

export const colors = {
  // Superfícies e texto
  surface: '#faf8ff',
  surfaceDim: '#d9d9e5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3fe',
  surfaceContainer: '#ededf9',
  surfaceContainerHigh: '#e7e7f3',
  surfaceContainerHighest: '#e1e2ed',
  surfaceVariant: '#e1e2ed',
  onSurface: '#191b23',
  onSurfaceVariant: '#434655',
  inverseSurface: '#2e3039',
  inverseOnSurface: '#f0f0fb',
  outline: '#737686',
  outlineVariant: '#c3c6d7',
  background: '#faf8ff',

  // Ação
  primary: '#004ac6',
  onPrimary: '#ffffff',
  primaryContainer: '#2563eb',
  onPrimaryContainer: '#eeefff',
  primaryFixed: '#dbe1ff',

  secondary: '#006398',
  onSecondary: '#ffffff',
  secondaryContainer: '#5bb8fe',
  onSecondaryContainer: '#00476e',

  tertiary: '#943700',
  tertiaryContainer: '#bc4800',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Nível 3: contorno de definição, para manter legibilidade sob sol forte
  hairline: '#e2e8f0',
} as const;

/**
 * Semânticas em "Soft Fill": 10% da cor no fundo, 100% no texto.
 * Usadas com parcimônia — só status, validação e alerta crítico — para não
 * quebrar a sensação arejada da interface.
 */
export const semantic = {
  success: { fg: '#047857', bg: 'rgba(4, 120, 87, 0.1)' },
  info: { fg: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
  warning: { fg: '#b45309', bg: 'rgba(180, 83, 9, 0.1)' },
  high: { fg: '#c2410c', bg: 'rgba(194, 65, 12, 0.1)' },
  danger: { fg: '#ba1a1a', bg: 'rgba(186, 26, 26, 0.1)' },
  neutral: { fg: '#475569', bg: 'rgba(71, 85, 105, 0.1)' },
} as const;

export type SemanticTone = keyof typeof semantic;

/** Ponto vivo de "conectado", igual ao indicador do protótipo. */
export const online = '#10b981';

/** Grade base de 4px, com incrementos de 16/24 nos contêineres de layout. */
export const spacing = {
  base: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  /** Margem de segurança horizontal no mobile. */
  gutter: 16,
} as const;

/** Aninhamento visual: card 16 > botão/campo 12 > badge 8. */
export const radius = {
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Elevação por camadas tonais e oclusão suave, nunca por sombra pesada.
 * Nível 0 é o fundo; Nível 1 são superfícies interativas; Nível 2 flutua.
 */
export const elevation = {
  level1: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  level2: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primary: {
    shadowColor: '#2563eb',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

/**
 * Nenhum elemento interativo abaixo de 44x44, independente do tamanho visual —
 * o app é operado com luva, em pé, muitas vezes sob chuva.
 */
export const touchTarget = 44;
