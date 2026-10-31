import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonthSummaryCard } from '../src/components/MonthSummaryCard';
import { TransactionGroupList } from '../src/components/TransactionGroupList';
import { getCategoryLabel } from '../src/constants/categories';
import { deleteTransaction, searchTransactions } from '../src/db/transactions';
import { formatDateLabel } from '../src/lib/date';
import { buildDaySections, sumByDirection, type DaySection } from '../src/lib/group';
import { formatYuan } from '../src/lib/money';
import { colors, radius, spacing } from '../src/theme';
import type { MonthSummary, Transaction } from '../src/types';

/** 输入防抖，避免每敲一个字查一次库 */
const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Transaction[]>([]);
  const [sections, setSections] = useState<DaySection[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const trimmed = keyword.trim();

  const runSearch = useCallback((value: string) => {
    if (!value) {
      setResults([]);
      setSections([]);
      return;
    }
    const rows = searchTransactions(value);
    setResults(rows);
    setSections(buildDaySections(rows));
  }, []);

  // 防抖 300ms；从编辑页返回时页面重新获得焦点，也会重查一次
  useFocusEffect(
    useCallback(() => {
      if (!trimmed) {
        runSearch('');
        return;
      }
      const timer = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }, [trimmed, runSearch]),
  );

  const handleRefresh = useCallback(() => {
    if (!trimmed) return;
    setRefreshing(true);
    try {
      runSearch(trimmed);
    } finally {
      setRefreshing(false);
    }
  }, [runSearch, trimmed]);

  const handleEdit = useCallback(
    (item: Transaction) => {
      router.push(`/edit?id=${item.id}`);
    },
    [router],
  );

  const handleDelete = useCallback(
    (item: Transaction) => {
      Alert.alert(
        '删除这笔？',
        `${formatDateLabel(item.date)} · ${getCategoryLabel(item.category)} · ${formatYuan(item.amountCents)}`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              try {
                deleteTransaction(item.id);
                runSearch(trimmed);
              } catch (e) {
                Alert.alert('删除失败', e instanceof Error ? e.message : '请重试');
              }
            },
          },
        ],
      );
    },
    [runSearch, trimmed],
  );

  const summary: MonthSummary | null =
    results.length > 0 ? { month: '', ...sumByDirection(results) } : null;

  const emptyView =
    trimmed.length === 0 ? (
      <View style={styles.empty}>
        <Ionicons name="search" size={32} color={colors.border} />
        <Text style={styles.emptyTitle}>输入关键词开始搜索</Text>
        <Text style={styles.emptyHint}>可搜备注内容或分类名称，范围是全部月份</Text>
      </View>
    ) : (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🔍</Text>
        <Text style={styles.emptyTitle}>没有找到「{trimmed}」</Text>
        <Text style={styles.emptyHint}>换个关键词试试，比如「午饭」「工资」</Text>
      </View>
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

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.sub} />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索备注或分类"
            placeholderTextColor="#b6bcc6"
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="搜索关键词"
          />
          {keyword.length > 0 ? (
            <Pressable
              onPress={() => setKeyword('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="清除搜索词"
            >
              <Ionicons name="close-circle" size={18} color={colors.sub} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <TransactionGroupList
        sections={sections}
        header={summary ? <MonthSummaryCard summary={summary} title="搜索结果合计" /> : null}
        empty={emptyView}
        onPressItem={handleEdit}
        onLongPressItem={handleDelete}
        onDeleteItem={handleDelete}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { backgroundColor: colors.inputBg },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBg,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  empty: { alignItems: 'center', paddingTop: 88, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: colors.sub, textAlign: 'center' },
});
