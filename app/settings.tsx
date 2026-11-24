import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  canDrawOverlays,
  getNotificationListener,
  getOverlayDebugState,
  isNotificationPermissionGranted,
  openNotificationListenerSettings,
  requestOverlayPermission,
} from '../src/lib/notificationBridge';
import {
  copyBackupToClipboard,
  readBackupFromClipboard,
} from '../src/lib/backup';
import type { BackupRecord } from '../src/lib/backupFormat';
import { currentMonthKey, formatMonthLabel } from '../src/lib/date';
import { exportTransactionsCsv } from '../src/lib/export';
import {
  countAllTransactions,
  listTransactionsByMonth,
  replaceAllTransactions,
} from '../src/db/transactions';
import { cardShadow, colors, radius, spacing } from '../src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const month = currentMonthKey();

  const [busy, setBusy] = useState<'export' | 'backup' | 'restore' | null>(null);
  const [monthCount, setMonthCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [listenerGranted, setListenerGranted] = useState(false);

  const refresh = useCallback(() => {
    setMonthCount(listTransactionsByMonth(month, { limit: 1000 }).length);
    setTotalCount(countAllTransactions());
    setOverlayGranted(canDrawOverlays());
    setListenerGranted(isNotificationPermissionGranted());
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleExport = useCallback(async () => {
    if (busy) return;
    setBusy('export');
    try {
      await exportTransactionsCsv(month);
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy, month]);

  const handleBackup = useCallback(async () => {
    if (busy) return;
    setBusy('backup');
    try {
      const count = await copyBackupToClipboard();
      Alert.alert(`备份成功（${count} 条）`, '备份数据已复制到剪贴板，请粘贴到微信等地方保存。');
    } catch (error) {
      Alert.alert('备份失败', error instanceof Error ? error.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy]);

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
        refresh();
        Alert.alert('恢复完成', `已恢复 ${count} 条记录`);
      } catch (error) {
        Alert.alert('恢复失败', error instanceof Error ? error.message : '数据未写入，请重试');
      }
    },
    [refresh],
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
    } catch (error) {
      Alert.alert('恢复失败', error instanceof Error ? error.message : '请重试');
    } finally {
      setBusy(null);
    }
  }, [busy, runRestore]);

  /** 悬浮窗诊断（含 5 项 ROM 设置清单 + 复制诊断） */
  const handleOverlayDiagnostics = useCallback(() => {
    const state = getOverlayDebugState();
    if (!state) {
      Alert.alert('自动记账不可用', '当前构建里没有通知监听模块（Expo Go 不支持），请用 APK。', [
        { text: '知道了', style: 'cancel' },
      ]);
      return;
    }

    const yesNo = (value: boolean | null) =>
      value === null || value === undefined ? '未知' : value ? '是' : '否';

    const lines = [
      `悬浮窗权限：${state.canDrawOverlays ? '有' : '没有'}`,
      `原生认为 App 在前台：${state.isAppInForeground ? '是' : '否'}`,
      `通知监听服务：${state.listenerConnected ? '已连接' : '未连接'}`,
      '',
      `上次判定：${state.lastDecision}`,
      `判定依据：${state.lastForegroundSource}`,
      `标志位 / importance：${yesNo(state.lastForegroundFlag)} / ${state.lastImportance}`,
      `importance 来源：${state.lastImportanceSource}`,
      `上次 addView：${state.lastAddViewOk === null ? '未尝试' : state.lastAddViewOk ? '成功' : '失败'}`,
      `错误信息：${state.lastError ?? '无'}`,
      `气泡 尝试/成功：${state.showAttempts} / ${state.showSuccesses}`,
      `待补录队列：${state.pendingQueueSize} 条`,
    ];

    const body = `${lines.join('\n')}\n\n弹不出气泡时，去系统设置把这 5 项都打开（国产 ROM 都要手动放行）：\n1. 显示在其他应用上层（悬浮窗）\n2. 自启动 —— 关掉「自动管理」改手动，允许自启动\n3. 关联启动 / 允许被其他应用唤醒\n4. 后台运行 / 后台活动\n5. 电池 → 省电策略设为「无限制」`;

    Alert.alert('自动记账诊断', body, [
      { text: '关闭', style: 'cancel' },
      {
        text: '复制诊断',
        onPress: () => {
          void import('expo-clipboard').then((Clipboard) =>
            Clipboard.setStringAsync(
              `【自动记账诊断】\n${lines.join('\n')}\n\n最近通知原文：\n${state.lastNotificationText || '（还没有抓到过通知）'}`,
            ),
          );
        },
      },
      { text: state.canDrawOverlays ? '重新授权' : '去授权', onPress: () => requestOverlayPermission() },
    ]);
  }, []);

  const hasModule = getNotificationListener() !== null;
  const version = Constants.expoConfig?.version ?? '1.0.0';

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
        <Text style={styles.headerTitle}>设置</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>数据</Text>
        <View style={[styles.card, cardShadow]}>
          <Row
            icon="cloud-download-outline"
            title="账单导入"
            subtitle="支付宝 / 微信账单，xlsx 或 csv 都支持"
            onPress={() => router.push('/import')}
            first
          />
          <Row
            icon="wallet-outline"
            title="月度预算"
            subtitle="设置每月预算，超支会在首页提示"
            onPress={() => router.push(`/budget?month=${month}`)}
          />
          <Row
            icon="share-outline"
            title="导出本月 CSV"
            subtitle={`${formatMonthLabel(month)} · ${monthCount} 笔`}
            onPress={() => void handleExport()}
            busy={busy === 'export'}
          />
          <Row
            icon="copy-outline"
            title="备份到剪贴板"
            subtitle={`当前共 ${totalCount} 笔，复制 JSON 存到微信/备忘录`}
            onPress={() => void handleBackup()}
            busy={busy === 'backup'}
          />
          <Row
            icon="download-outline"
            title="从剪贴板恢复"
            subtitle="会用剪贴板数据覆盖现有全部账单"
            onPress={() => void handleRestore()}
            busy={busy === 'restore'}
            danger
          />
        </View>

        <Text style={styles.sectionTitle}>自动记账</Text>
        <View style={[styles.card, cardShadow]}>
          <Row
            icon="notifications-outline"
            title="通知使用权"
            subtitle={listenerGranted ? '已授权' : '未授权 · 点此去系统设置开启'}
            onPress={() => openNotificationListenerSettings()}
            disabled={!hasModule}
            first
          />
          <Row
            icon="chatbubble-ellipses-outline"
            title="悬浮窗快捷记账"
            subtitle={overlayGranted ? '已开启 · 抓到消费会弹气泡' : '未开启 · 目前走应用内横幅'}
            onPress={handleOverlayDiagnostics}
            disabled={!hasModule}
          />
          <Row
            icon="list-outline"
            title="最近通知原文"
            subtitle="排查「为什么没识别」，可复制原文"
            onPress={() => router.push('/notif-log')}
            disabled={!hasModule}
          />
        </View>

        <Text style={styles.sectionTitle}>关于</Text>
        <View style={[styles.card, cardShadow]}>
          <Row
            icon="information-circle-outline"
            title="版本"
            subtitle={`${version} · 数据只存在本机`}
            onPress={() => Alert.alert('记账工具', `版本 ${version}\n所有数据保存在本机 SQLite，不上传任何服务器。`)}
            first
          />
        </View>

        <Text style={styles.footnote}>自动记账依赖系统通知权限；不读取任何网络数据。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  disabled?: boolean;
  first?: boolean;
}

function Row({ icon, title, subtitle, onPress, busy, danger, disabled, first }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivided,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={danger ? colors.expense : colors.text} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && { color: colors.expense }]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.sub} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.border} />
      )}
    </Pressable>
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
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.sub,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg + 4,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.inputBg },
  rowDisabled: { opacity: 0.45 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: colors.text },
  rowSubtitle: { fontSize: 11, color: colors.sub, lineHeight: 16 },
  footnote: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    fontSize: 11,
    color: colors.sub,
    lineHeight: 17,
  },
});
