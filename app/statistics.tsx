import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCategory } from '../src/constants/categories';
import { getCategoryColor } from '../src/constants/categoryColors';
import { listTransactionsByRange } from '../src/db/transactions';
import { formatYuan } from '../src/lib/money';
import {
  currentPeriod,
  isCurrentPeriod,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from '../src/lib/period';
import { buildCategoryRank, summarize } from '../src/lib/report';
import { centsToYuanValue } from '../src/lib/stats';
import { cardShadow, colors, radius, spacing } from '../src/theme';
import type { Transaction } from '../src/types';

const TABS: Array<{ kind: PeriodKind; label: string }> = [
  { kind: 'week', label: '周' },
  { kind: 'month', label: '月' },
  { kind: 'year', label: '年' },
];

export default function StatisticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [period, setPeriod] = useState<Period>(() => currentPeriod('month'));
  const [rows, setRows] = useState<Transaction[]>([]);

  const load = useCallback(() => {
    setRows(listTransactionsByRange(period.start, period.end));
  }, [period.start, period.end]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const summary = useMemo(() => summarize(rows, period), [rows, period]);
  const rank = useMemo(() => buildCategoryRank(rows, 'expense'), [rows]);

  /** 饼图半径随屏幕宽度收缩，窄屏也不会溢出 */
  const chartRadius = Math.min(112, Math.max(84, Math.round((width - spacing.lg * 6) / 2)));

  /** 交给饼图的数据：只在这里把「分」换成「元」 */
  const pieData = useMemo(
    () =>
      rank.map((item) => ({
        value: centsToYuanValue(item.totalCents),
        color: getCategoryColor(item.category),
      })),
    [rank],
  );

  const canGoNext = !isCurrentPeriod(period);

  const switchKind = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    setPeriod(currentPeriod(kind));
  };

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
          报表
        </Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = tab.kind === period.kind;
          return (
            <Pressable
              key={tab.kind}
              onPress={() => switchKind(tab.kind)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.periodBar}>
        <Pressable
          onPress={() => setPeriod((prev) => shiftPeriod(prev, -1))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="上一个周期"
          style={({ pressed }) => [styles.periodBtn, pressed && styles.periodBtnPressed]}
        >
          <Ionicons name="chevron-back" size={18} color={colors.sub} />
        </Pressable>

        <Text style={styles.periodLabel}>{periodLabel(period)}</Text>

        <Pressable
          onPress={() => canGoNext && setPeriod((prev) => shiftPeriod(prev, 1))}
          disabled={!canGoNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="下一个周期"
          style={({ pressed }) => [
            styles.periodBtn,
            pressed && styles.periodBtnPressed,
            !canGoNext && styles.periodBtnDisabled,
          ]}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.sub} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardLabel}>总支出</Text>
          <Text style={styles.totalValue}>{formatYuan(summary.expenseCents)}</Text>

          <View style={styles.metrics}>
            <Metric label="日均" value={formatYuan(summary.dailyAvgCents)} />
            <Metric label="收入" value={formatYuan(summary.incomeCents)} />
            <Metric label="笔数" value={`${summary.count}`} />
          </View>
        </View>

        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>支出分布</Text>

          {rank.length === 0 ? (
            <Text style={styles.empty}>这段时间没有支出</Text>
          ) : (
            <View style={styles.chartWrap}>
              <PieChart
                key={`${period.kind}-${period.start}`}
                data={pieData}
                donut
                radius={chartRadius}
                innerRadius={Math.round(chartRadius * 0.62)}
                strokeWidth={2}
                strokeColor={colors.card}
                isAnimated
                animationDuration={550}
                focusOnPress={false}
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={styles.centerTitle}>总支出</Text>
                    <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatYuan(summary.expenseCents)}
                    </Text>
                  </View>
                )}
              />
            </View>
          )}
        </View>

        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>分类排行</Text>

          {rank.length === 0 ? (
            <Text style={styles.empty}>这段时间没有支出</Text>
          ) : (
            rank.map((item, index) => {
              const category = getCategory(item.category);
              const color = getCategoryColor(item.category);
              const barWidth = `${Math.max(item.percent, 2)}%` as DimensionValue;

              return (
                <Pressable
                  key={item.category}
                  onPress={() =>
                    router.push(
                      `/category?category=${item.category}&start=${period.start}&end=${period.end}&label=${encodeURIComponent(
                        periodLabel(period),
                      )}`,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`查看${category.label}明细`}
                  style={({ pressed }) => [
                    styles.rankRow,
                    index > 0 && styles.rankDivided,
                    pressed && styles.rankPressed,
                  ]}
                >
                  <View style={styles.rankHead}>
                    <View style={styles.rankName}>
                      <View style={[styles.dot, { backgroundColor: color }]} />
                      <Text style={styles.rankLabel}>{category.label}</Text>
                      <Text style={styles.rankCount}>{item.count} 笔</Text>
                    </View>
                    <Text style={styles.rankValue}>{formatYuan(item.totalCents)}</Text>
                  </View>

                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: barWidth, backgroundColor: color }]} />
                  </View>

                  <Text style={styles.rankPercent}>{item.percent.toFixed(1)}%</Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
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
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
    marginTop: spacing.xs,
  },
  tab: { paddingHorizontal: 22, paddingVertical: 6, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.card, ...cardShadow },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.sub },
  tabTextActive: { color: colors.text },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  periodBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnPressed: { backgroundColor: colors.inputBg },
  periodBtnDisabled: { opacity: 0.3 },
  periodLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    minWidth: 120,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  content: { gap: spacing.md, paddingTop: spacing.xs },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 12, color: colors.sub },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  cardHint: { fontSize: 11, color: colors.sub },
  totalValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  metrics: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.md },
  metric: { flex: 1, gap: 2 },
  metricLabel: { fontSize: 11, color: colors.sub },
  metricValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  chartWrap: { alignItems: 'center', marginTop: spacing.md },
  centerLabel: { alignItems: 'center' },
  centerTitle: { fontSize: 11, color: colors.sub },
  centerValue: { fontSize: 18, fontWeight: '700', color: colors.text, maxWidth: 96 },
  empty: { fontSize: 12, color: colors.sub, marginTop: spacing.md },
  rankRow: { paddingTop: spacing.md },
  rankPressed: { opacity: 0.6 },
  rankDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.md,
  },
  rankHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rankLabel: { fontSize: 13, fontWeight: '500', color: colors.text },
  rankCount: { fontSize: 11, color: colors.sub },
  rankValue: { fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inputBg,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  rankPercent: { fontSize: 10, color: colors.sub, marginTop: 3 },
});
