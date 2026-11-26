import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  canDrawOverlays,
  getNotificationListener,
  requestOverlayPermission,
  showTestOverlay,
  isOverlayAlert,
  setOverlayAlert,
  getOverlayDebugState,
  ensureSmsPermission,
  hasNotificationPermission,
  hasSmsPermission,
  isAccessibilityEnabled,
  isNotificationPermissionGranted,
  openAccessibilitySettings,
  openNotificationListenerSettings,
} from '../src/lib/notificationBridge';
import {
  copyBackupToClipboard,
  readBackupFromClipboard,
} from '../src/lib/backup';
import type { BackupRecord } from '../src/lib/backupFormat';
import { currentMonthKey, formatMonthLabel } from '../src/lib/date';
import { exportTransactionsCsv } from '../src/lib/export';
import { clearImportedBills, countImportedBills } from '../src/db/imports';
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
  const [listenerGranted, setListenerGranted] = useState(false);
  const [a11yEnabled, setA11yEnabled] = useState(false);
  const [smsGranted, setSmsGranted] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [notifyOk, setNotifyOk] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [alertOn, setAlertOn] = useState(true);

  const refresh = useCallback(() => {
    setMonthCount(listTransactionsByMonth(month, { limit: 1000 }).length);
    setTotalCount(countAllTransactions());
    setListenerGranted(isNotificationPermissionGranted());
    setA11yEnabled(isAccessibilityEnabled());
    setSmsGranted(hasSmsPermission());
    setImportedCount(countImportedBills());
    setNotifyOk(hasNotificationPermission());
    setOverlayOk(canDrawOverlays());
    setAlertOn(isOverlayAlert());
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

  /** 自动记账诊断：只保留还能定位问题的字段 */
  const handleDiagnostics = useCallback(() => {
    const state = getOverlayDebugState();
    if (!state) {
      Alert.alert('自动记账不可用', '当前构建里没有通知监听模块（Expo Go 不支持），请用 APK。', [
        { text: '知道了', style: 'cancel' },
      ]);
      return;
    }

    const lines = [
      `通知监听服务：${state.listenerConnected ? '已连接' : '未连接'}`,
      `读屏：${isAccessibilityEnabled() ? '已开启' : '未开启'}`,
      '自动记账：已启用（捕获即入账）',
      '',
      `上次判定：${state.lastDecision}`,
      `判定依据：${state.lastForegroundSource}`,
      `错误信息：${state.lastError ?? '无'}`,
      `待入库队列：${state.pendingQueueSize} 条`,
    ];

    Alert.alert('自动记账诊断', lines.join('\n'), [
      { text: '关闭', style: 'cancel' },
      {
        text: '复制',
        onPress: () => {
          void import('expo-clipboard').then((Clipboard) =>
            Clipboard.setStringAsync(
              `【自动记账诊断】\n${lines.join('\n')}\n\n最近通知原文：\n${state.lastNotificationText || '（无）'}`,
            ),
          );
        },
      },
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
            icon="refresh-outline"
            title="重置导入记录"
            subtitle={`已记 ${importedCount} 条指纹，重置后可重导`}
            onPress={() => {
              Alert.alert(
                '重置导入记录？',
                '只会清掉「哪些账单导入过」的记录，不动账本里的任何一笔。重置后可以重新导入同一份账单（会重复记账，注意）。',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '重置',
                    style: 'destructive',
                    onPress: () => {
                      clearImportedBills();
                      setImportedCount(0);
                      Alert.alert('已重置', '现在可以重新导入账单了');
                    },
                  },
                ],
              );
            }}
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
            subtitle={`共 ${totalCount} 笔，复制成文本保存`}
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
            icon="notifications-circle-outline"
            title="通知权限"
            subtitle={
              notifyOk
                ? '已允许 · 付款后会弹提示，可直接改分类'
                : '未允许 · 收不到任何提示'
            }
            danger={!notifyOk}
            onPress={() => {
              void (async () => {
                if (Platform.OS !== 'android') return;
                const granted = await PermissionsAndroid.request(
                  PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                );
                const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
                setNotifyOk(ok);
                if (!ok) {
                  Alert.alert(
                    '还是没允许',
                    '请到「设置 → 应用 → 记账工具 → 通知」里手动打开。',
                  );
                }
              })();
            }}
            disabled={!hasModule}
            first
          />
          <Row
            icon="albums-outline"
            title="付款时顶部弹出提示"
            subtitle={
              alertOn
                ? '已开启 · 付款后顶部浮出一条，可点分类或写备注'
                : '已关闭 · 只进通知栏'
            }
            onPress={() => {
              const next = !alertOn;
              if (!next) {
                Alert.alert(
                  '关闭顶部提示？',
                  '关闭后付款不会弹条，只能下拉通知栏看到「已记一笔」。常驻通知也会消失。',
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '关闭',
                      style: 'destructive',
                      onPress: () => {
                        setOverlayAlert(false);
                        setAlertOn(false);
                      },
                    },
                  ],
                );
                return;
              }

              if (!overlayOk) {
                const ok = requestOverlayPermission();
                Alert.alert(
                  '先给悬浮窗权限',
                  ok
                    ? '在系统页面里打开「允许显示在其他应用上层」，回来再点一次这个开关。'
                    : '请手动到「设置 → 应用 → 记账工具 → 显示在其他应用上层」打开。',
                );
                return;
              }

              setOverlayAlert(true);
              setAlertOn(true);
            }}
            disabled={!hasModule}
            first
          />
          <Row
            icon="notifications-outline"
            title="通知使用权"
            subtitle={listenerGranted ? '已授权' : '未授权 · 点此去系统设置开启'}
            onPress={() => openNotificationListenerSettings()}
            disabled={!hasModule}
          />
          <Row
            icon="scan-outline"
            title="读屏自动记账"
            subtitle={
              a11yEnabled
                ? '已开启 · 停在支付结果页就能识别'
                : '未开启 · 补齐「通知没发」的场景'
            }
            onPress={() => {
              if (!a11yEnabled) {
                Alert.alert(
                  '开启读屏自动记账',
                  '用于在微信/支付宝的支付成功页面自动识别金额。\n\n只在页面出现「支付成功」等字样时读取内容，不收集其他信息。\n\n接下来会跳到系统「无障碍」页面，找到「记账工具」并打开开关。',
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '去开启', onPress: () => openAccessibilitySettings() },
                  ],
                );
              } else {
                Alert.alert('读屏已开启', '如需关闭，请到系统「无障碍」里关掉「记账工具」。');
              }
            }}
            disabled={!hasModule}
          />
          <Row
            icon="mail-unread-outline"
            title="短信自动记账"
            subtitle={smsGranted ? '已授权 · 银行动账短信会自动识别' : '未授权 · 信用卡/储蓄卡靠它'}
            onPress={() => {
              void (async () => {
                if (smsGranted) {
                  Alert.alert(
                    '短信自动记账已开启',
                    '收到银行动账短信时会自动识别金额。如需关闭，请到系统「设置 → 应用 → 记账工具 → 权限」里关掉短信。',
                  );
                  return;
                }

                const granted = await ensureSmsPermission();
                setSmsGranted(granted);
                if (granted) {
                  Alert.alert('已开启', '之后收到银行动账短信会自动记账，金额相同的一笔不会被微信通知重复记。');
                } else {
                  Alert.alert('没有授权', '短信权限被拒绝了。可以再到系统「设置 → 应用 → 记账工具 → 权限」里手动打开。');
                }
              })();
            }}
            disabled={!hasModule}
          />
          <Row
            icon="pulse-outline"
            title="自检与诊断"
            subtitle="看服务是否真的在工作，可复制结果"
            onPress={handleDiagnostics}
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
