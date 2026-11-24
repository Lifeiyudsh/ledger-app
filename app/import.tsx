import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commitImport, previewBillFile, type ImportPreview } from '../src/lib/billImport/importer';
import { formatYuan } from '../src/lib/money';
import { cardShadow, colors, radius, spacing } from '../src/theme';

export default function ImportScreen() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');

  const stats = useMemo(() => {
    if (!preview) return null;
    const expense = preview.records
      .filter((record) => record.direction === 'expense')
      .reduce((sum, record) => sum + record.amountCents, 0);
    const income = preview.records
      .filter((record) => record.direction === 'income')
      .reduce((sum, record) => sum + record.amountCents, 0);
    const dates = preview.records.map((record) => record.date).sort();
    return {
      expense,
      income,
      expenseCount: preview.records.filter((record) => record.direction === 'expense').length,
      incomeCount: preview.records.filter((record) => record.direction === 'income').length,
      from: dates[0],
      to: dates[dates.length - 1],
    };
  }, [preview]);

  const handlePick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/zip',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setFileName(asset.name ?? '账单文件');
      const next = await previewBillFile(asset.uri, asset.name ?? 'bill.csv');

      if (!next.source) {
        setPreview(null);
        Alert.alert('没识别出账单', next.message ?? '请确认选择的是支付宝或微信导出的账单文件');
        return;
      }

      setPreview(next);
    } catch (error) {
      setPreview(null);
      Alert.alert('读取失败', error instanceof Error ? error.message : '文件可能太大或格式不支持');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleImport = useCallback(() => {
    if (!preview || preview.records.length === 0) return;

    Alert.alert(
      `导入 ${preview.records.length} 笔账单？`,
      '导入后可在列表里查看、编辑或删除。重复导入同一份账单不会重复记账。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '导入',
          onPress: () => {
            try {
              const { inserted } = commitImport(preview);
              Alert.alert('导入完成', `成功导入 ${inserted} 笔账单`, [
                { text: '好', onPress: () => router.back() },
              ]);
            } catch (error) {
              Alert.alert('导入失败', error instanceof Error ? error.message : '请重试');
            }
          },
        },
      ],
    );
  }, [preview, router]);

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
        <Text style={styles.headerTitle}>账单导入</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>怎么拿到账单文件</Text>
          <Text style={styles.step}>微信：我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 用于个人对账</Text>
          <Text style={styles.step}>支付宝：我的 → 账单 → 右上角 ⋯ → 开具交易流水证明 → 用于个人对账</Text>
          <Text style={styles.hint}>
            zip、xlsx、csv 都能直接选，不用解压。浏览器下载后被改成 .xlsx 也没关系。
          </Text>
        </View>

        <Pressable
          onPress={() => void handlePick()}
          disabled={busy}
          style={({ pressed }) => [styles.pickBtn, pressed && styles.pickBtnPressed]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="document-attach-outline" size={18} color="#ffffff" />
              <Text style={styles.pickText}>{preview ? '重新选择文件' : '选择账单文件'}</Text>
            </>
          )}
        </Pressable>

        {preview && stats ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={styles.meta}>
              {preview.source === 'alipay' ? '支付宝账单' : '微信支付账单'}
              {stats.from && stats.to ? ` · ${stats.from} ~ ${stats.to}` : ' · 没有可导入的记录'}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>支出 {stats.expenseCount} 笔</Text>
                <Text style={[styles.statValue, { color: colors.expense }]}>{formatYuan(stats.expense)}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>收入 {stats.incomeCount} 笔</Text>
                <Text style={[styles.statValue, { color: colors.income }]}>{formatYuan(stats.income)}</Text>
              </View>
            </View>

            <View style={styles.badgeRow}>
              <Text style={styles.badge}>可导入 {preview.records.length} 笔</Text>
              {preview.duplicates > 0 ? (
                <Text style={[styles.badge, styles.badgeMuted]}>已存在 {preview.duplicates} 笔</Text>
              ) : null}
              {preview.skipped > 0 ? (
                <Text style={[styles.badge, styles.badgeMuted]}>跳过 {preview.skipped} 笔</Text>
              ) : null}
            </View>

            {preview.records.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.empty}>
                  {preview.duplicates > 0
                    ? '这份账单里的记录都已经导入过了'
                    : '没有可导入的记录，原因：'}
                </Text>
                {preview.duplicates === 0 ? (
                  <Text style={styles.emptyReason}>
                    {[
                      preview.reasons.date > 0 ? `日期无法识别 ${preview.reasons.date} 笔` : '',
                      preview.reasons.amount > 0 ? `金额无法识别 ${preview.reasons.amount} 笔` : '',
                      preview.reasons.status > 0 ? `交易已关闭/失败 ${preview.reasons.status} 笔` : '',
                      preview.reasons.notCounted > 0
                        ? `不计收支 ${preview.reasons.notCounted} 笔`
                        : '',
                    ]
                      .filter(Boolean)
                      .join('\n') || '未知原因'}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Pressable
                onPress={handleImport}
                style={({ pressed }) => [styles.importBtn, pressed && styles.importBtnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.importText}>导入这 {preview.records.length} 笔</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Text style={styles.footnote}>
          分类是按商户名和平台分类自动猜的，导入后可以逐笔改成你要的。
        </Text>
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
  content: { paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  step: { fontSize: 12, lineHeight: 19, color: colors.text },
  hint: { fontSize: 11, color: colors.sub, marginTop: spacing.xs },
  meta: { fontSize: 12, color: colors.sub },
  pickBtn: {
    marginHorizontal: spacing.lg,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickBtnPressed: { opacity: 0.85 },
  pickText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  statsRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  statItem: { flex: 1, gap: 2 },
  statLabel: { fontSize: 12, color: colors.sub },
  statValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    fontSize: 11,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  badgeMuted: { color: colors.sub, backgroundColor: colors.inputBg },
  empty: { fontSize: 12, color: colors.sub, marginTop: spacing.sm },
  emptyBox: { marginTop: spacing.xs, gap: 2 },
  emptyReason: { fontSize: 12, color: colors.text, lineHeight: 19 },
  importBtn: {
    marginTop: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtnPressed: { opacity: 0.85 },
  importText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  footnote: {
    marginHorizontal: spacing.lg,
    fontSize: 11,
    lineHeight: 17,
    color: colors.sub,
  },
});
