import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionMenu } from '../src/components/ActionMenu';
import { BudgetBanner } from '../src/components/BudgetBanner';
import { PendingCaptureBanner } from '../src/components/PendingCaptureBanner';
import { MonthSummaryCard } from '../src/components/MonthSummaryCard';
import { MonthSwitcher } from '../src/components/MonthSwitcher';
import { TransactionGroupList } from '../src/components/TransactionGroupList';
import { getCategoryLabel } from '../src/constants/categories';
import {
  countAllTransactions,
  deleteTransaction,
  getMonthSummary,
  listTransactionsByMonth,
  replaceAllTransactions,
} from '../src/db/transactions';
import { subscribeAutoBookkeepingDone } from '../src/lib/autoBookkeeping';
import { copyBackupToClipboard, readBackupFromClipboard } from '../src/lib/backup';
import { getBudgetCents } from '../src/lib/budget';
import {
  canDrawOverlays,
  getNotificationListener,
  getOverlayDebugState,
  openNotificationListenerSettings,
  requestOverlayPermission,
  type OverlayDebugState,
} from '../src/lib/notificationBridge';
import { clearPendingCapture, usePendingCapture, type PendingCapture } from '../src/lib/pendingCapture';
import { exportTransactionsCsv } from '../src/lib/export';
import type { BackupRecord } from '../src/lib/backupFormat';
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
  const [busy, setBusy] = useState<'export' | 'backup' | 'restore' | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  /** 当月预算（分），null = 未设置 */
  const [budgetCents, setBudgetCents] = useState<number | null>(null);
  /** 通知监听捕获到的待确认账单（内存态，未落库） */
  const pendingCapture = usePendingCapture();
  const hasNotificationModule = getNotificationListener() !== null;
  /** 「显示在其他应用上层」是否已开启（决定用气泡还是应用内横幅） */
  const [overlayGranted, setOverlayGranted] = useState(false);
  /** 原生诊断快照（气泡弹不出来时看这里的每一项） */
  const [debugState, setDebugState] = useState<OverlayDebugState | null>(null);

  const load = useCallback(() => {
    const rows = listTransactionsByMonth(month, { limit: 500 });
    setSections(buildDaySections(rows));
    setSummary(getMonthSummary(month));
  }, [month]);

  // 自动记账补录完成后刷新列表（补录可能发生在列表挂载之前）
  useEffect(() => subscribeAutoBookkeepingDone(() => load()), [load]);

  // 每次页面获得焦点 / 切换月份都重新读库 + 读预算
  // （从「记一笔」「编辑」「预算设置」返回后，列表和提示框都会立即刷新）
  useFocusEffect(
    useCallback(() => {
      load();

      let alive = true;
      setOverlayGranted(canDrawOverlays());
      const snapshot = getOverlayDebugState();
      setDebugState(snapshot);

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
  const handleRowLongPress = useCallback(
    (item: Transaction) => {
      Alert.alert(
        `${getCategoryLabel(item.category)} ${formatYuan(item.amountCents)}`,
        formatDateLabel(item.date),
        [
          { text: '取消', style: 'cancel' },
          { text: '编辑', onPress: () => router.push(`/edit?id=${item.id}`) },
          { text: '删除', style: 'destructive', onPress: () => performDelete(item) },
        ],
      );
    },
    [performDelete, router],
  );

  /** 悬浮窗诊断：把所有决策输入摊开，支持一键复制发给开发者 */
  const handleOverlayPermission = useCallback(() => {
    const state = getOverlayDebugState();

    if (!state) {
      Alert.alert('悬浮窗不可用', '当前构建里没有通知监听模块（Expo Go 不支持），请用 dev build / APK。', [
        { text: '知道了', style: 'cancel' },
      ]);
      return;
    }

    const yesNo = (value: boolean | null) =>
      value === null || value === undefined ? '未知' : value ? '是' : '否';

    const lines = [
      `悬浮窗权限：${state.canDrawOverlays ? '有' : '没有'}（判定时：${yesNo(state.lastCanDrawAtDecision)}）`,
      `原生认为 App 在前台：${state.isAppInForeground ? '是' : '否'}`,
      `通知监听服务：${state.listenerConnected ? '已连接' : '未连接'}`,
      '',
      `上次判定：${state.lastDecision}`,
      `判定依据：${state.lastForegroundSource}`,
      `标志位 / importance：${yesNo(state.lastForegroundFlag)} / ${state.lastImportance}`,
      `importance 来源：${state.lastImportanceSource}｜进程：${state.lastProcessName}`,
      `最近生命周期事件：${state.lastEventSource}`,
      `判定时在后台：${yesNo(state.lastForegroundAtDecision === null ? null : !state.lastForegroundAtDecision)}`,
      `上次 addView：${state.lastAddViewOk === null ? '未尝试' : state.lastAddViewOk ? '成功' : '失败'}`,
      `窗口类型：${state.lastWindowType}`,
      `错误信息：${state.lastError ?? '无'}`,
      `气泡 尝试/成功：${state.showAttempts} / ${state.showSuccesses}`,
      `待补录队列：${state.pendingQueueSize} 条`,
    ];

    const body = `${lines.join('\n')}\n\n如果弹不出气泡，请去系统设置里允许【后台弹出界面】和【自启动】。`;

    Alert.alert('悬浮窗诊断', body, [
      { text: '关闭', style: 'cancel' },
      {
        text: '复制诊断',
        onPress: () => {
          const payload = `【悬浮窗诊断 ${new Date().toLocaleString()}】\n${lines.join('\n')}\n\n最近通知原文：\n${
            state.lastNotificationText || '（还没有抓到过通知）'
          }`;
          void Clipboard.setStringAsync(payload);
        },
      },
      {
        text: state.canDrawOverlays ? '重新授权' : '去授权',
        onPress: () => {
          requestOverlayPermission();
        },
      },
    ]);
  }, []);

  const handleExport = useCallback(async () => {
    if (busy) return;
    setBusy('export');
    try {
      await exportTransactionsCsv(month); // 只导出当前选中月份，文件写入缓存目录后由系统分享面板接管
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy, month]);

  const handleBackup = useCallback(async () => {
    if (busy) return;
    setBusy('backup');
    try {
      const count = await copyBackupToClipboard();
      Alert.alert(
        `备份成功（${count} 条）`,
        '备份数据已复制到剪贴板，请粘贴到微信等地方保存。',
      );
    } catch (e) {
      Alert.alert('备份失败', e instanceof Error ? e.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy]);

  /** 覆盖恢复：清空 + 批量插入在同一个事务里，失败整体回滚 */
  const runRestore = useCallback(
    (records: readonly BackupRecord[]) => {
      const items = records.map((record) => ({
        direction: record.direction,
        amountCents: record.amount_cents,
        category: record.category,
        note: record.note,
        date: record.date,
        createdAt: record.created_at ?? null,
      }));

      try {
        const count = replaceAllTransactions(items);
        load();
        Alert.alert('恢复完成', `已恢复 ${count} 条记录`);
      } catch (e) {
        Alert.alert('恢复失败', e instanceof Error ? e.message : '数据未写入，请重试');
      }
    },
    [load],
  );

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const result = await readBackupFromClipboard();

      const current = countAllTransactions();
      const skippedTip =
        result.rejected > 0 ? `\n其中 ${result.rejected} 条格式不合法，会被忽略。` : '';
      Alert.alert(
        '覆盖恢复？',
        `剪贴板里有 ${result.accepted.length} 条记录，当前已有 ${current} 条。\n恢复会先清空现有全部账单再写入，不可撤销。${skippedTip}`,
        [
          { text: '取消', style: 'cancel' },
          { text: '覆盖恢复', style: 'destructive', onPress: () => runRestore(result.accepted) },
        ],
      );
    } catch (e) {
      Alert.alert('恢复失败', e instanceof Error ? e.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy, runRestore]);

  const openMoreMenu = useCallback(() => {
    if (busy) return;
    // 打开菜单前刷新一次诊断，保证「权限/前后台」显示的是最新值
    setOverlayGranted(canDrawOverlays());
    setDebugState(getOverlayDebugState());
    setMenuVisible(true);
  }, [busy]);

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
                onPress={() => router.push(`/budget?month=${month}`)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="预算设置"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Ionicons name="settings-outline" size={19} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={openMoreMenu}
                disabled={busy !== null}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="更多操作：导出、备份、恢复"
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              >
                <Text style={[styles.headerMore, busy !== null && styles.headerActionDisabled]}>
                  ⋯
                </Text>
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

      <ActionMenu
        visible={menuVisible}
        title={formatMonthLabel(month)}
        onClose={() => setMenuVisible(false)}
        items={[
          {
            key: 'csv',
            label: `导出 ${formatMonthLabel(month)} CSV`,
            hint: '只包含当前月份的账单',
            onPress: () => void handleExport(),
          },
          {
            key: 'backup',
            label: '备份到剪贴板',
            hint: '复制 JSON，粘贴到微信/备忘录保存',
            onPress: () => void handleBackup(),
          },
          {
            key: 'restore',
            label: '从剪贴板恢复',
            hint: '读取剪贴板 JSON 并覆盖当前数据',
            onPress: () => void handleRestore(),
          },
          // 只有装了带原生模块的构建（dev build / apk）才会出现
          ...(hasNotificationModule
            ? [
                {
                  key: 'overlay',
                  label: `悬浮窗权限：${overlayGranted ? '有' : '没有'}`,
                  hint: `当前是否在后台：${
                    (debugState?.isAppInForeground ?? true) ? '否' : '是'
                  } · 点按查看诊断`,
                  onPress: handleOverlayPermission,
                },
                {
                  key: 'notification',
                  label: '通知监听设置',
                  hint: '需在系统里授予「通知使用权」才能自动识别',
                  onPress: () => {
                    openNotificationListenerSettings();
                  },
                },
              ]
            : []),
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
});
