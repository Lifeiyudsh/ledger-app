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
  getNotificationLogs,
  type NotificationLogEntry,
} from '../src/lib/notificationBridge';
import { colors, radius, spacing } from '../src/theme';

/** 调试用：查看监听服务捕获到的最近 50 条通知原文（含未命中） */
export default function NotificationLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLogs(await getNotificationLogs());
  }, []);

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
          <Text style={styles.tip}>
            最近 {logs.length} 条（含未命中）。点卡片可复制原文；没看到转账/收款说明微信压根没发通知。
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={32} color={colors.border} />
            <Text style={styles.emptyTitle}>还没有捕获到通知</Text>
            <Text style={styles.emptyHint}>去付一笔款，再回来看</Text>
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
  tip: { fontSize: 12, color: colors.sub, lineHeight: 18, marginBottom: spacing.sm },
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
