import { StyleSheet, Text, View } from 'react-native';
import { evaluateBudget } from '../lib/budgetMath';
import { formatYuan } from '../lib/money';
import { colors, radius, spacing } from '../theme';

interface Props {
  /** 当月总支出（分） */
  spentCents: number;
  /** 当月预算（分），未设置为 null */
  budgetCents: number | null;
}

/**
 * 列表页顶部预算提示。
 * - 未设预算：不渲染
 * - 支出 < 80%：一行淡色文字
 * - 80% ≤ 支出 < 100%：橙色提示框
 * - 支出 ≥ 100%：红色提示框
 */
export function BudgetBanner({ spentCents, budgetCents }: Props) {
  const status = evaluateBudget(spentCents, budgetCents);

  if (status.level === 'none') return null;

  if (status.level === 'safe') {
    return (
      <Text style={styles.safeText}>
        本月预算剩余 {formatYuan(status.remainingCents)}
      </Text>
    );
  }

  const isOver = status.level === 'over';

  return (
    <View style={[styles.banner, isOver ? styles.bannerOver : styles.bannerWarning]}>
      <Text
        style={[styles.bannerText, isOver ? styles.textOver : styles.textWarning]}
        accessibilityRole="alert"
      >
        {isOver
          ? `🚨 本月已超支 ${formatYuan(status.overCents)}`
          : `⚠️ 本月预算仅剩 ${formatYuan(status.remainingCents)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeText: {
    fontSize: 12,
    color: colors.sub,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerWarning: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  bannerOver: { backgroundColor: '#fdeceb', borderColor: '#f3a9a6' },
  bannerText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  textWarning: { color: '#b45309' },
  textOver: { color: colors.expense },
});
