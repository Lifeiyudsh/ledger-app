import { StyleSheet, Text, View } from 'react-native';
import { formatMonthLabel } from '../lib/date';
import { formatYuan } from '../lib/money';
import { cardShadow, colors, radius, spacing } from '../theme';
import type { MonthSummary } from '../types';

interface Props {
  summary: MonthSummary;
  /** 覆盖左上角标题（搜索页用「搜索结果合计」） */
  title?: string;
}

/** 列表顶部：支出 / 收入 / 结余 */
export function MonthSummaryCard({ summary, title }: Props) {
  const netPositive = summary.netCents >= 0;

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.headerRow}>
        <Text style={styles.month}>{title ?? formatMonthLabel(summary.month)}</Text>
        <Text style={styles.count}>共 {summary.count} 笔</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="支出" value={formatYuan(summary.expenseCents)} color={colors.expense} />
        <View style={styles.divider} />
        <Metric label="收入" value={formatYuan(summary.incomeCents)} color={colors.income} />
        <View style={styles.divider} />
        <Metric
          label="结余"
          value={formatYuan(summary.netCents)}
          color={netPositive ? colors.text : colors.expense}
        />
      </View>
    </View>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 15, fontWeight: '600', color: colors.text },
  count: { fontSize: 12, color: colors.sub },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 12, color: colors.sub },
  metricValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border, marginHorizontal: spacing.md },
});
