import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#111417',
  sub: '#8a9099',
  border: '#ebedf0',
  primary: '#2f6fed',
  primarySoft: '#eaf0ff',
  /** 支出：红 */
  expense: '#e5484d',
  /** 收入：绿 */
  income: '#16a34a',
  /** 金额输入底色 */
  inputBg: '#f2f4f7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const cardShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1 },
  default: {},
});

export function directionColor(direction: 'expense' | 'income'): string {
  return direction === 'income' ? colors.income : colors.expense;
}
