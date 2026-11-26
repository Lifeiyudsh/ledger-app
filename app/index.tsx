import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionMenu } from '../src/components/ActionMenu';
import { CategoryGrid } from '../src/components/CategoryGrid';
import { BudgetBanner } from '../src/components/BudgetBanner';
import { PendingCaptureBanner } from '../src/components/PendingCaptureBanner';
import { MonthSummaryCard } from '../src/components/MonthSummaryCard';
import { MonthSwitcher } from '../src/components/MonthSwitcher';
import { TransactionGroupList } from '../src/components/TransactionGroupList';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryLabel,
  type CategoryKey,
} from '../src/constants/categories';
import {
  countAllTransactions,
  deleteTransaction,
  getMonthSummary,
  listAutoUncategorized,
  listTransactionsByMonth,
  updateTransaction,
} from '../src/db/transactions';
import { subscribeAutoBookkeepingDone } from '../src/lib/autoBookkeeping';
import { getBudgetCents } from '../src/lib/budget';
import { clearPendingCapture, usePendingCapture, type PendingCapture } from '../src/lib/pendingCapture';
import { currentMonthKey, formatDateLabel, formatMonthLabel } from '../src/lib/date';
import { buildDaySections, type DaySection } from '../src/lib/group';
import { formatYuan } from '../src/lib/money';
import { colors, radius, spacing } from '../src/theme';
import type { MonthSummary, Transaction } from '../src/types';

const emptySummary = (month: string): MonthSummary => ({
  month,
  expenseCents: 0,
  incomeCents: 0,
  netCents: 0,
  count: 0,
});

export default function ListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /** 当前选中的月份 'YYYY-MM'，默认本月 */
  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [sections, setSections] = useState<DaySection[]>([]);
  const [summary, setSummary] = useState<MonthSummary>(() => emptySummary(currentMonthKey()));
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  /** 长按某一笔后弹出的操作对象 */
  const [rowAction, setRowAction] = useState<Transaction | null>(null);
  /** 正在快速改分类的那一笔 */
  const [quickEdit, setQuickEdit] = useState<Transaction | null>(null);
  /** 当月预算（分），null = 未设置 */
  const [budgetCents, setBudgetCents] = useState<number | null>(null);
  /** 本月「其他 · 自动」的笔数，用来提示用户去归类 */
  const [tidyCount, setTidyCount] = useState(0);
  /** 通知监听捕获到的待确认账单（内存态，未落库） */
  const pendingCapture = usePendingCapture();

  const load = useCallback(() => {
    const rows = listTransactionsByMonth(month, { limit: 500 });
    setSections(buildDaySections(rows));
    setSummary(getMonthSummary(month));
    setTidyCount(listAutoUncategorized(month).length);
  }, [month]);

  /**
   * 引导只在「新装 + 账本为空」时出现：
   * 老用户（已有记录）升级不会被弹，家人第一次装才看得到。
   */
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem('ledger.onboarded.v1').then((done) => {
      if (!alive || done) return;
      if (countAllTransactions() > 0) {
        void AsyncStorage.setItem('ledger.onboarded.v1', '1');
        return;
      }
      router.push('/welcome');
    });
    return () => {
      alive = false;
    };
  }, [router]);

  // 自动记账补录完成后刷新列表（补录可能发生在列表挂载之前）
  useEffect(() => subscribeAutoBookkeepingDone(() => load()), [load]);

  // 每次页面获得焦点 / 切换月份都重新读库 + 读预算
  // （从「记一笔」「编辑」「预算设置」返回后，列表和提示框都会立即刷新）
  useFocusEffect(
    useCallback(() => {
      load();

      let alive = true;

      getBudgetCents(month)
        .then((value) => {
          if (alive) setBudgetCents(value);
        })
        .catch(() => {
          if (alive) setBudgetCents(null);
        });

      return () => {
        alive = false;
      };
    }, [load, month]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    try {
      load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /** 真正执行删除（不含确认） */
  const performDelete = useCallback(
    (item: Transaction) => {
      try {
        deleteTransaction(item.id);
        load();
      } catch (e) {
        Alert.alert('删除失败', e instanceof Error ? e.message : '请重试');
      }
    },
    [load],
  );

  /** 右侧 × ：先弹确认再删 */
  const handleDelete = useCallback(
    (item: Transaction) => {
      Alert.alert(
        '删除这笔？',
        `${formatDateLabel(item.date)} · ${getCategoryLabel(item.category)} · ${formatYuan(item.amountCents)}`,
        [
          { text: '取消', style: 'cancel' },
          { text: '删除', style: 'destructive', onPress: () => performDelete(item) },
        ],
      );
    },
    [performDelete],
  );

  const handleEdit = useCallback(
    (item: Transaction) => {
      router.push(`/edit?id=${item.id}`);
    },
    [router],
  );

  /** 点击自动识别横幅 → 带着金额/日期/备注去「记一笔」，分类由用户选 */
  const handleConfirmCapture = useCallback(
    (capture: PendingCapture) => {
      router.push({
        pathname: '/new',
        params: {
          amountCents: String(capture.amountCents),
          direction: capture.direction,
          date: capture.date,
          note: capture.note,
        },
      });
    },
    [router],
  );

  /** 长按：操作菜单本身就是一次确认，不再叠第二层弹窗 */
  const handleRowLongPress = useCallback((item: Transaction) => {
    setRowAction(item);
  }, []);

  /** 长按菜单里选「改分类」→ 选中即生效，不进入编辑页 */
  const handleQuickCategory = useCallback(
    (category: CategoryKey) => {
      const target = quickEdit;
      if (!target) return;

      try {
        updateTransaction(target.id, {
          direction: target.direction,
          amountCents: target.amountCents,
          category,
          note: target.note,
          date: target.date,
        });
        setQuickEdit(null);
        load();
      } catch (error) {
        Alert.alert('修改失败', error instanceof Error ? error.message : '请重试');
      }
    },
    [load, quickEdit],
  );

  /** 覆盖恢复：清空 + 批量插入在同一个事务里，失败整体回滚 */
  const openMoreMenu = useCallback(() => {
    setMenuVisible(true);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '账单',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push('/search')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="搜索账单"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Ionicons name="search" size={20} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => router.push('/statistics')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="图表统计"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Ionicons name="pie-chart-outline" size={20} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={() => router.push('/settings')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="设置"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Ionicons name="settings-outline" size={19} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={openMoreMenu}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="更多操作：账单导入、设置"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Text style={styles.headerMore}>⋯</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      {/* 月份切换固定在顶部，滚动列表时始终可点 */}
      <MonthSwitcher month={month} onChange={setMonth} />

      {/* 自动记账捕获：原生识别到的疑似消费，确认后才落库 */}
      {pendingCapture ? (
        <PendingCaptureBanner
          capture={pendingCapture}
          onConfirm={handleConfirmCapture}
          onDismiss={clearPendingCapture}
        />
      ) : null}

      {/* 预算提示：未设预算时组件自己返回 null */}
      <BudgetBanner spentCents={summary.expenseCents} budgetCents={budgetCents} />

      {tidyCount > 0 ? (
        <Pressable
          onPress={() => router.push(`/tidy?month=${month}`)}
          accessibilityRole="button"
          accessibilityLabel={`${tidyCount}笔自动记账未归类，点击整理`}
          style={({ pressed }) => [styles.tidyBar, pressed && styles.tidyBarPressed]}
        >
          <Text style={styles.tidyText}>
            {tidyCount} 笔自动记账还没归类
          </Text>
          <Text style={styles.tidyAction}>去归一下 ›</Text>
        </Pressable>
      ) : null}

      <TransactionGroupList
        sections={sections}
        header={<MonthSummaryCard summary={summary} />}
        empty={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>{formatMonthLabel(month)}还没有账单</Text>
            <Text style={styles.emptyHint}>换个月份看看，或点右下角 + 记一笔</Text>
          </View>
        }
        onPressItem={handleEdit}
        onLongPressItem={handleRowLongPress}
        onDeleteItem={handleDelete}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
      />

      <Pressable
        onPress={() => router.push('/new')}
        accessibilityRole="button"
        accessibilityLabel="记一笔"
        style={({ pressed }) => [
          styles.fab,
          { bottom: spacing.lg + insets.bottom },
          pressed && styles.fabPressed,
        ]}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>

      {/* 长按某一笔：改分类 / 编辑 / 删除 */}
      <ActionMenu
        visible={rowAction !== null}
        title={
          rowAction
            ? `${getCategoryLabel(rowAction.category)} ${formatYuan(rowAction.amountCents)}`
            : ''
        }
        onClose={() => setRowAction(null)}
        items={[
          {
            key: 'category',
            label: '改分类',
            hint: '选一下立刻生效，不用进编辑页',
            onPress: () => {
              setQuickEdit(rowAction);
              setRowAction(null);
            },
          },
          {
            key: 'edit',
            label: '编辑',
            hint: '改金额、备注、日期',
            onPress: () => {
              const id = rowAction?.id;
              setRowAction(null);
              if (id) router.push(`/edit?id=${id}`);
            },
          },
          {
            key: 'delete',
            label: '删除',
            hint: '删掉这一笔',
            onPress: () => {
              const target = rowAction;
              setRowAction(null);
              if (target) performDelete(target);
            },
          },
        ]}
      />

      {/* 快速改分类 */}
      <Modal
        visible={quickEdit !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickEdit(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setQuickEdit(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>改分类</Text>
          <CategoryGrid
            options={quickEdit?.direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES}
            value={quickEdit?.category ?? null}
            onChange={handleQuickCategory}
          />
        </View>
      </Modal>

      <ActionMenu
        visible={menuVisible}
        title={formatMonthLabel(month)}
        onClose={() => setMenuVisible(false)}
        items={[
          {
            key: 'import',
            label: '账单导入',
            hint: '支付宝/微信账单，xlsx 或 csv 都支持',
            onPress: () => router.push('/import'),
          },
          {
            key: 'settings',
            label: '设置',
            hint: '导出、备份恢复、自动记账',
            onPress: () => router.push('/settings'),
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: { backgroundColor: colors.inputBg },
  headerMore: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.primary,
    fontWeight: '600',
  },
  headerActionDisabled: { color: colors.sub, opacity: 0.6 },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.sub },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0b1220',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  fabIcon: { fontSize: 26, color: '#ffffff', lineHeight: 30, fontWeight: '500' },
  tidyBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  tidyBarPressed: { opacity: 0.7 },
  tidyText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  tidyAction: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
