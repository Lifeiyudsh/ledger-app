import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatYuan } from '../src/lib/money';
import {
  clearNotificationLogs,
  getNotificationListener,
  getNotificationLogs,
  getOverlayDebugState,
  hasSmsPermission,
  isAccessibilityEnabled,
  isNotificationPermissionGranted,
  openAccessibilitySettings,
  openNotificationListenerSettings,
  refreshListenerBinding,
  canDrawOverlays,
  hasNotificationPermission,
  type NotificationLogEntry,
  type OverlayDebugState,
} from '../src/lib/notificationBridge';
import { colors, radius, spacing } from '../src/theme';

/** 调试用：查看监听服务捕获到的最近 50 条通知原文（含未命中） */
export default function NotificationLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [listenerOk, setListenerOk] = useState(false);
  const [a11yOk, setA11yOk] = useState(false);
  const [smsOk, setSmsOk] = useState(false);
  const [debug, setDebug] = useState<OverlayDebugState | null>(null);
  const [notifyOk, setNotifyOk] = useState(false);
  const [overlayOk, setOverlayOk] = useState(false);
  const [fixing, setFixing] = useState(false);
  const hasModule = getNotificationListener() !== null;


  const load = useCallback(async () => {
    setListenerOk(isNotificationPermissionGranted());
    setA11yOk(isAccessibilityEnabled());
    setSmsOk(hasSmsPermission());
    setDebug(getOverlayDebugState());
    setNotifyOk(hasNotificationPermission());
    setOverlayOk(canDrawOverlays());
    setLogs(await getNotificationLogs());
  }, []);


  /** 通知使用权在、但服务没绑上：请求系统重绑一次 */
  const handleFixBinding = useCallback(async () => {
    if (fixing) return;
    setFixing(true);
    refreshListenerBinding();
    // 绑定是异步的，给它一点时间再复检
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await load();
    setFixing(false);

    if (!getOverlayDebugState()?.listenerConnected) {
      Alert.alert(
        '还是没连上',
        '系统没有响应重绑请求。请去「通知使用权」里把「记账工具」关掉再打开，然后回到本页看状态。',
        [
          { text: '知道了', style: 'cancel' },
          { text: '去设置', onPress: () => openNotificationListenerSettings() },
        ],
      );
    }
  }, [fixing, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleClear = useCallback(() => {
    Alert.alert('清空通知日志？', '只清空调试日志，不影响已记录的账单', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void clearNotificationLogs().then(load);
        },
      },
    ]);
  }, [load]);

  const handleCopy = useCallback((entry: NotificationLogEntry) => {
    const lines = [
      `时间：${formatTime(entry.timestamp)}`,
      `包名：${entry.packageName}`,
      `命中：${entry.isMatch ? '是' : '否'}${entry.matchedKeyword ? `（${entry.matchedKeyword}）` : ''}`,
      entry.amountFen !== null ? `金额：${formatYuan(entry.amountFen)}` : '金额：-',
      entry.title ? `title：${entry.title}` : '',
      entry.text ? `text：${entry.text}` : '',
      entry.bigText ? `bigText：${entry.bigText}` : '',
      entry.subText ? `subText：${entry.subText}` : '',
      entry.tickerText ? `ticker：${entry.tickerText}` : '',
      entry.extrasDump ? `extras：\n${entry.extrasDump}` : '',
    ].filter(Boolean);

    void Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert('已复制', '这条通知的原文已复制到剪贴板');
  }, []);

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
        <Text style={styles.headerTitle}>通知原文</Text>
        <Pressable onPress={handleClear} hitSlop={10} accessibilityRole="button">
          <Text style={styles.clear}>清空</Text>
        </Pressable>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        contentContainerStyle={[styles.list, { paddingBottom: spacing.xxl + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.sub} />
        }
        ListHeaderComponent={
          <View style={styles.head}>
            <View style={styles.chips}>
              <Pressable
                onPress={() => openNotificationListenerSettings()}
                disabled={!hasModule}
                style={[styles.chip, listenerOk ? styles.chipOn : styles.chipOff]}
              >
                <Text style={[styles.chipText, listenerOk && styles.chipTextOn]}>
                  通知监听 {listenerOk ? '已开启' : '未开启'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => openAccessibilitySettings()}
                disabled={!hasModule}
                style={[styles.chip, a11yOk ? styles.chipOn : styles.chipOff]}
              >
                <Text style={[styles.chipText, a11yOk && styles.chipTextOn]}>
                  读屏 {a11yOk ? '已开启' : '未开启'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.checkCard}>
              <View style={styles.checkHead}>
                <Text style={styles.checkTitle}>自检</Text>
                <Pressable
                  onPress={() => {
                    const lines = [
                      `模块：${hasModule ? '正常' : '缺失'}`,
                      `通知使用权：${listenerOk ? '有' : '没有'}`,
                      `监听服务：${debug?.listenerConnected ? '已连接' : '未连接'}`,
                      `读屏：${a11yOk ? '已开启' : '未开启'}`,
                      `短信：${smsOk ? '有' : '没有'}`,
                      `通知权限：${notifyOk ? '有' : '没有'}`,
                      `日志条数：${logs.length}`,
                      `上次判定：${debug?.lastDecision ?? '-'}`,
                      `最近通知原文：\n${debug?.lastNotificationText || '（无）'}`,
                    ];
                    void import('expo-clipboard').then((Clipboard) =>
                      Clipboard.setStringAsync(`【自检】\n${lines.join('\n')}`),
                    );
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.copyAll}>复制</Text>
                </Pressable>
              </View>

              <CheckRow label="通知使用权" ok={listenerOk} />
              <CheckRow label="监听服务绑定" ok={Boolean(debug?.listenerConnected)}>
                {!debug?.listenerConnected ? (
                  <Pressable onPress={() => void handleFixBinding()} hitSlop={8} disabled={fixing}>
                    <Text style={styles.fixLink}>{fixing ? '修复中…' : '修复'}</Text>
                  </Pressable>
                ) : null}
              </CheckRow>
              <CheckRow label="读屏（无障碍）" ok={a11yOk} />
              <CheckRow label="短信" ok={smsOk} />
              <CheckRow label="通知权限（弹提示用）" ok={notifyOk} />
              <CheckRow label="悬浮提示条" ok={overlayOk} />

              {!debug?.listenerConnected ? (
                <Text style={styles.checkHint}>
                  服务没绑上时，通知监听收不到任何东西。先点上面的「修复」；不行就去「通知使用权」里把本应用关掉再打开。
                </Text>
              ) : null}

              {debug?.lastDecision ? (
                <Text style={styles.lastDecision}>上次判定：{debug.lastDecision}</Text>
              ) : null}
            </View>

            <Text style={styles.tip}>
              最近 {logs.length} 条，只记录和支付相关的通知（含未命中）。点卡片可复制原文。
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={listenerOk || a11yOk ? 'notifications-off-outline' : 'alert-circle-outline'}
              size={32}
              color={colors.border}
            />
            <Text style={styles.emptyTitle}>
              {!hasModule
                ? '当前构建不含自动记账模块'
                : listenerOk || a11yOk
                  ? '服务已开启，但还没抓到记录'
                  : '两个开关都没打开'}
            </Text>
            <Text style={styles.emptyHint}>
              {!hasModule
                ? '需要用 APK 版本，Expo Go 不支持'
                : listenerOk || a11yOk
                  ? '去付一笔款，停在支付结果页 2 秒，再回来看'
                  : '没开开关就抓不到任何东西。重装 App 后系统会重置这两个权限，需要重新打开'}
            </Text>

            {hasModule && !listenerOk && !a11yOk ? (
              <View style={styles.emptyActions}>
                <Pressable
                  onPress={() => openNotificationListenerSettings()}
                  style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
                >
                  <Text style={styles.emptyBtnText}>去开通知监听</Text>
                </Pressable>
                <Pressable
                  onPress={() => openAccessibilitySettings()}
                  style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
                >
                  <Text style={styles.emptyBtnText}>去开读屏</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleCopy(item)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardHead}>
              <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
              <View style={[styles.badge, item.isMatch ? styles.badgeHit : styles.badgeMiss]}>
                <Text style={[styles.badgeText, item.isMatch && styles.badgeTextHit]}>
                  {item.isMatch ? '命中' : '未命中'}
                </Text>
              </View>
            </View>

            <Text style={styles.pkg}>{item.packageName}</Text>

            {item.isMatch && item.amountFen !== null ? (
              <Text style={styles.amount}>
                {formatYuan(item.amountFen)}
                {item.matchedKeyword ? ` · ${item.matchedKeyword}` : ''}
              </Text>
            ) : null}

            {item.title ? <Text style={styles.field}>title：{item.title}</Text> : null}
            {item.text ? <Text style={styles.field}>text：{item.text}</Text> : null}
            {item.bigText ? <Text style={styles.field}>bigText：{item.bigText}</Text> : null}
            {item.subText ? <Text style={styles.field}>subText：{item.subText}</Text> : null}
            {item.extrasDump ? (
              <Text style={styles.extras} numberOfLines={8}>
                {item.extrasDump}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function CheckRow({
  label,
  ok,
  children,
}: {
  label: string;
  ok: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkLabel}>{label}</Text>
      <View style={styles.checkRight}>
        <Text style={[styles.checkValue, ok ? styles.ok : styles.bad]}>
          {ok ? '正常' : '未就绪'}
        </Text>
        {children}
      </View>
    </View>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
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
  clear: { fontSize: 14, color: colors.sub, paddingHorizontal: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  head: { gap: spacing.sm, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.primarySoft },
  chipOff: { backgroundColor: colors.inputBg },
  chipText: { fontSize: 11, fontWeight: '600', color: colors.sub },
  chipTextOn: { color: colors.primary },
  checkCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  checkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  copyAll: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkLabel: { fontSize: 12, color: colors.text },
  checkValue: { fontSize: 12, fontWeight: '600' },
  ok: { color: colors.income },
  bad: { color: colors.expense },
  lastDecision: { fontSize: 11, color: colors.sub, marginTop: 2, lineHeight: 16 },
  checkRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fixLink: { fontSize: 12, fontWeight: '700', color: colors.primary },
  checkHint: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.expense,
    marginTop: 2,
  },
  tip: { fontSize: 12, color: colors.sub, lineHeight: 18 },
  emptyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  emptyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  emptyBtnPressed: { opacity: 0.7 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  cardPressed: { opacity: 0.7 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 12, color: colors.sub, fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  badgeHit: { backgroundColor: colors.income },
  badgeMiss: { backgroundColor: colors.inputBg },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.sub },
  badgeTextHit: { color: '#ffffff' },
  pkg: { fontSize: 12, color: colors.text, fontWeight: '600' },
  amount: { fontSize: 14, fontWeight: '700', color: colors.income, marginTop: 2 },
  field: { fontSize: 12, lineHeight: 18, color: colors.text },
  extras: { fontSize: 10, lineHeight: 15, color: colors.sub, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.sub },
});
