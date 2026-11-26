import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EXPENSE_CATEGORIES, getCategoryLabel, type CategoryKey } from '../src/constants/categories';
import { listAutoUncategorized, updateTransaction } from '../src/db/transactions';
import { formatMonthLabel } from '../src/lib/date';
import { formatYuan } from '../src/lib/money';
import { cardShadow, colors, radius, spacing } from '../src/theme';
import type { Transaction } from '../src/types';

/**
 * 待归类：自动记账时分类落在「其他」的记录，逐条点一下分类就完事。
 * 解决的是「用户不知道这些还能改」的问题 —— 把动作直接摆在记录下面。
 */
export default function TidyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ month?: string }>();

  const [rows, setRows] = useState<Transaction[]>([]);

  const load = useCallback(() => {
    if (!params.month) return;
    setRows(listAutoUncategorized(params.month));
  }, [params.month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const assign = useCallback(
    (item: Transaction, category: CategoryKey) => {
      try {
        updateTransaction(item.id, {
          direction: item.direction,
          amountCents: item.amountCents,
          category,
          note: item.note,
          date: item.date,
        });
        setRows((prev) => prev.filter((row) => row.id !== item.id));
      } catch (error) {
        Alert.alert('修改失败', error instanceof Error ? error.message : '请重试');
      }
    },
    [],
  );

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
        <Text style={styles.headerTitle}>待归类</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
        <Text style={styles.hint}>
          {rows.length > 0
            ? `${formatMonthLabel(params.month ?? '')}有 ${rows.length} 笔自动记账还是「其他」，点下面的分类就归好了。`
            : '这个月的自动记账都归类完了。'}
        </Text>

        {rows.map((item) => (
          <View key={item.id} style={[styles.card, cardShadow]}>
            <View style={styles.rowHead}>
              <Text style={styles.amount}>-{formatYuan(item.amountCents)}</Text>
              <Text style={styles.note} numberOfLines={1}>
                {item.note ?? ''}
              </Text>
              <Text style={styles.date}>{item.date.slice(5)}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {EXPENSE_CATEGORIES.map((category) => (
                <Pressable
                  key={category.key}
                  onPress={() => assign(item, category.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`归为${category.label}`}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipEmoji}>{category.emoji}</Text>
                  <Text style={styles.chipText}>{category.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ))}

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={34} color={colors.border} />
            <Text style={styles.emptyText}>
              没有待归类的记录了
            </Text>
            <Text style={styles.emptyHint}>以后自动记账抓到的会先归到「其他」，随时可以来这里改</Text>
          </View>
        ) : null}
      </ScrollView>
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
  content: { paddingTop: spacing.xs, gap: spacing.md },
  hint: {
    marginHorizontal: spacing.lg,
    fontSize: 12,
    lineHeight: 18,
    color: colors.sub,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  amount: { fontSize: 16, fontWeight: '700', color: colors.expense, fontVariant: ['tabular-nums'] },
  note: { flex: 1, fontSize: 12, color: colors.sub },
  date: { fontSize: 11, color: colors.sub },
  chips: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBg,
  },
  chipPressed: { opacity: 0.6 },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, color: colors.text },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: colors.sub, textAlign: 'center', lineHeight: 18 },
});
