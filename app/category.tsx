import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionGroupList } from '../src/components/TransactionGroupList';
import { getCategory, type CategoryKey } from '../src/constants/categories';
import { deleteTransaction, listTransactionsByRange } from '../src/db/transactions';
import { formatYuan } from '../src/lib/money';
import { buildDaySections } from '../src/lib/group';
import { cardShadow, colors, radius, spacing } from '../src/theme';
import type { Transaction } from '../src/types';

/**
 * 某个分类在某个周期内的明细。
 * 从报表的「分类排行」点进来，用来回答「这个月餐饮到底吃了什么」。
 */
export default function CategoryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{
    category?: string;
    start?: string;
    end?: string;
    label?: string;
  }>();

  const categoryKey = (params.category ?? 'other') as CategoryKey;
  const start = params.start ?? '';
  const end = params.end ?? '';
  const periodLabel = params.label ?? '';

  const [rows, setRows] = useState<Transaction[]>([]);

  const load = useCallback(() => {
    if (!start || !end) return;
    const all = listTransactionsByRange(start, end);
    setRows(all.filter((row) => row.category === categoryKey && row.direction === 'expense'));
  }, [categoryKey, start, end]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const category = getCategory(categoryKey);
  const sections = useMemo(() => buildDaySections(rows), [rows]);
  const totalCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.amountCents, 0),
    [rows],
  );

  const handleDelete = useCallback(
    (item: Transaction) => {
      Alert.alert('删除这笔？', `${formatYuan(item.amountCents)} · ${item.note || category.label}`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            try {
              deleteTransaction(item.id);
              load();
            } catch (error) {
              Alert.alert('删除失败', error instanceof Error ? error.message : '请重试');
            }
          },
        },
      ]);
    },
    [category.label, load],
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
        <Text style={styles.headerTitle}>
          {category.emoji} {category.label}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <TransactionGroupList
        sections={sections}
        onPressItem={(item) => router.push(`/edit?id=${item.id}`)}
        onLongPressItem={(item) => router.push(`/edit?id=${item.id}`)}
        onDeleteItem={handleDelete}
        contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
        header={
          <View style={[styles.summary, cardShadow]}>
            <Text style={styles.summaryLabel}>{periodLabel || '合计'}</Text>
            <Text style={styles.summaryValue}>{formatYuan(totalCents)}</Text>
            <Text style={styles.summaryMeta}>{rows.length} 笔</Text>
          </View>
        }
        empty={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={30} color={colors.border} />
            <Text style={styles.emptyText}>这段时间没有「{category.label}」的支出</Text>
          </View>
        }
      />
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
  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  summaryLabel: { fontSize: 12, color: colors.sub },
  summaryValue: { fontSize: 26, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  summaryMeta: { fontSize: 12, color: colors.sub },
  empty: { alignItems: 'center', paddingTop: 70, gap: spacing.sm },
  emptyText: { fontSize: 13, color: colors.sub },
});
