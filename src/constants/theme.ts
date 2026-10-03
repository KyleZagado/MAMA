export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  overlay: string;
  heroBackground: string;
  heroText: string;
  heroTextMuted: string;
  accent: string;
  accentSoft: string;
};

export const lightColors: ThemeColors = {
  background: '#F6F8F7',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF2EF',
  border: '#E1E8E3',
  text: '#17342C',
  textMuted: '#5E6F67',
  textSubtle: '#8A9690',
  primary: '#16745A',
  primarySoft: '#E2F0E9',
  onPrimary: '#FFFFFF',
  danger: '#B3443A',
  dangerSoft: '#FFF0EF',
  warning: '#9A6420',
  warningSoft: '#FFF5E8',
  success: '#276448',
  successSoft: '#EAF5EF',
  overlay: 'rgba(12, 28, 22, 0.45)',
  heroBackground: '#111827',
  heroText: '#FFFFFF',
  heroTextMuted: '#9AA3B2',
  accent: '#4CB782',
  accentSoft: '#E3F5EC',
};

export const darkColors: ThemeColors = {
  background: '#0E1512',
  surface: '#16201C',
  surfaceAlt: '#1D2A25',
  border: '#27352F',
  text: '#E8F1ED',
  textMuted: '#A3B3AB',
  textSubtle: '#7B8A83',
  primary: '#4CC29A',
  primarySoft: '#1B3A30',
  onPrimary: '#06241A',
  danger: '#F08A80',
  dangerSoft: '#3A1F1D',
  warning: '#E5B26B',
  warningSoft: '#33281A',
  success: '#7FD3A9',
  successSoft: '#17302A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  heroBackground: '#1A4A3B',
  heroText: '#F2FAF6',
  heroTextMuted: '#A9C7BB',
  accent: '#4CC29A',
  accentSoft: '#1B3A30',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const MAX_CONTENT_WIDTH = 560;
