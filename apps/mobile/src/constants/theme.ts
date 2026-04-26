export const Colors = {
  // Brand
  primary: '#E8520B',
  primaryDark: '#C43F06',
  primaryLight: '#FF6B2B',
  gold: '#F5A827',
  goldLight: '#FFD080',
  goldDark: '#E09000',
  logoBrown: '#B5835A',

  // Surfaces
  background: '#FFF8F0',
  bgWarm: '#FFF3EC',
  surface: '#FFFFFF',
  surfaceSunken: '#FAF1E8',
  scanBg: '#0D1117',

  // Text
  textPrimary: '#1A0A00',
  textSecondary: '#8B5A3A',
  textMuted: '#C4956A',

  // Lines
  border: '#F0E0D0',
  borderStrong: '#E6CCB2',
  divider: '#F5EBE0',

  // Semantic
  success: '#22C55E',
  successBg: '#DCFCE7',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  info: '#3B82F6',
  infoBg: '#EFF6FF',

  // Role accents (LoginScreen)
  roleBoss: '#E8520B',
  roleBossBg: '#FFF3EC',
  roleBranch: '#F5A827',
  roleBranchBg: '#FFF8E6',
  roleStore: '#22C55E',
  roleStoreBg: '#F0FFF4',
  roleSales: '#3B82F6',
  roleSalesBg: '#EFF6FF',

  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#F0E0D0',
  tabBarActive: '#E8520B',
  tabBarInactive: '#C4956A',

  // Misc
  overlay: 'rgba(26,10,0,0.5)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadow = {
  card: {
    shadowColor: '#E8520B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  strong: {
    shadowColor: '#E8520B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  lift: {
    shadowColor: '#E8520B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
};

// Gradient stop arrays for expo-linear-gradient
export const Gradients = {
  primary: ['#FF6B2B', '#E8520B'] as const,
  gold: ['#FFD080', '#F5A827'] as const,
};

// iOS keeps system PingFang SC (Apple's PingFang is hand-tuned for screen).
// Android uses Alibaba PuHuiTi (registered via useFonts in App.tsx,
// free for commercial use, covers GB18030).
import { Platform } from 'react-native';

export const FontFamily = {
  regular: Platform.select({
    ios: 'PingFang SC',
    android: 'AlibabaPuHuiTi-Regular',
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'PingFang SC',
    android: 'AlibabaPuHuiTi-Medium',
    default: 'System',
  }),
  bold: Platform.select({
    ios: 'PingFang SC',
    android: 'AlibabaPuHuiTi-Bold',
    default: 'System',
  }),
};

export const numericFont = {
  fontVariant: ['tabular-nums'] as Array<'tabular-nums'>,
};
