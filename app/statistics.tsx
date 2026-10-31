import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonthSwitcher } from '../src/components/MonthSwitcher';
import { getCategory } from '../src/constants/categories';
import { getCategoryColor } from '../src/constants/categoryColors';
import { listExpenseByCategory, type CategoryExpenseBucket } from '../src/db/transactions';
import { currentMonthKey } from '../src/lib/date';
import { formatYuan } from '../src/lib/money';
import { centsToYuanValue, formatPercent, toPercentValue } from '../src/lib/stats';
import { cardShadow, colors, radius, spacing } from '../src/theme';

const CHART_RADIUS = 108;
const INNER_RADIUS = 66;

export default function StatisticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [buckets, setBuckets] = useState<CategoryExpenseBucket[]>([]);

  const load = useCallback(() => {
    setBuckets(listExpenseByCategory(month));
  }, [month]);

  // 切月 / 从编辑页返回都会重查
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** 总支出（整数「分」相加，不经过浮点） */
  const totalCents = useMemo(
    () => buckets.reduce((acc, bucket) => acc + bucket.totalCents, 0),
    [buckets],
  );

  /** 交给饼图的数据：仅此处把「分」除以 100 变成「元」 */
  const pieData = useMemo(
    () =>
      buckets.map((bucket) => ({
        value: centsToYuanValue(bucket.totalCents),
        color: getCategoryColor(bucket.category),
      })),
    [buckets],
  );

  const hasExpense = buckets.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          统计
        </Text>
        <View style={styles.headerRight} />
      </View>

      <MonthSwitcher month={month} onChange={setMonth} />

      {hasExpense ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, cardShadow]}>
            <View style={styles.chartWrap}>
              <PieChart
                key={month /* 切月强制重建，动画从头播一遍 */}
                data={pieData}
                donut
                radius={CHART_RADIUS}
                innerRadius={INNER_RADIUS}
                strokeWidth={2}
                strokeColor={colors.card}
                isAnimated
                animationDuration={550}
                focusOnPress={false}
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={styles.centerLabelTitle}>总支出</Text>
                    <Text
                      style={styles.centerLabelValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatYuan(totalCents)}
                    </Text>
                  </View>
                )}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>分类明细</Text>

          <View style={[styles.card, cardShadow, styles.legendCard]}>
            {buckets.map((bucket, index) => {
              const category = getCategory(bucket.category);
              const color = getCategoryColor(bucket.category);
              const percent = toPercentValue(bucket.totalCents, totalCents);

              return (
                <View
                  key={bucket.category}
                  style={[styles.legendRow, index > 0 && styles.legendRowDivided]}
                >
                  <View style={[styles.legendIcon, { backgroundColor: `${color}1F` }]}>
                    <Text style={styles.legendEmoji}>{category.emoji}</Text>
                  </View>

                  <View style={styles.legendMiddle}>
                    <View style={styles.legendTitleRow}>
                      <View style={[styles.dot, { backgroundColor: color }]} />
                      <Text style={styles.legendName} numberOfLines={1}>
                        {category.label}
                      </Text>
                      <Text style={styles.legendCount}>{bucket.count} 笔</Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.trackFill,
                          {
                            width: `${Math.max(percent, 1)}%` as DimensionValue,
                            backgroundColor: color,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <View style={styles.legendRight}>
                    <Text style={styles.legendAmount}>{formatYuan(bucket.totalCents)}</Text>
                    <Text style={styles.legendPercent}>{formatPercent(bucket.totalCents, totalCents)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="pie-chart-outline" size={34} color={colors.border} />
          <Text style={styles.emptyTitle}>本月暂无支出</Text>
          <Text style={styles.emptyHint}>换个月份看看，或先去记一笔支出</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { backgroundColor: colors.inputBg },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  headerRight: { width: 36 },

  content: { paddingTop: spacing.md, gap: spacing.md },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  chartWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  centerLabel: { alignItems: 'center', justifyContent: 'center', width: INNER_RADIUS * 2 - 16 },
  centerLabelTitle: { fontSize: 12, color: colors.sub },
  centerLabelValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.sub,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  legendCard: { paddingVertical: spacing.xs, paddingHorizontal: 0 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  legendRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendEmoji: { fontSize: 16 },
  legendMiddle: { flex: 1, gap: 6 },
  legendTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendName: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  legendCount: { fontSize: 11, color: colors.sub },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inputBg,
    overflow: 'hidden',
  },
  trackFill: { height: 4, borderRadius: 2 },
  legendRight: { alignItems: 'flex-end', gap: 2, minWidth: 84 },
  legendAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  legendPercent: { fontSize: 12, color: colors.sub, fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', paddingTop: 96, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.sub, textAlign: 'center' },
});
