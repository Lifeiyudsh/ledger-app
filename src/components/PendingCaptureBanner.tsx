import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatYuan } from '../lib/money';
import type { PendingCapture } from '../lib/pendingCapture';
import { colors, radius, spacing } from '../theme';

interface Props {
  capture: PendingCapture;
  /** 点横幅 → 带着金额/日期/备注去「记一笔」 */
  onConfirm: (capture: PendingCapture) => void;
  /** 忽略这条捕获（不落库） */
  onDismiss: () => void;
}

/**
 * 自动记账捕获的确认横幅。
 * 只是「疑似」，必须用户点进来手动选分类保存，才不会把广告当账单写库。
 */
export function PendingCaptureBanner({ capture, onConfirm, onDismiss }: Props) {
  const label = capture.direction === 'income' ? '收入' : '消费';

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onConfirm(capture)}
        accessibilityRole="button"
        accessibilityLabel={`发现一笔疑似${label} ${formatYuan(capture.amountCents)}，点击确认记账`}
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={18} color={colors.primary} />
        </View>

        <View style={styles.middle}>
          <Text style={styles.title} numberOfLines={1}>
            发现一笔疑似{label}：{formatYuan(capture.amountCents)}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {capture.appName}
            {capture.note ? ` · ${capture.note}` : ''} · 点击确认记账
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>

      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="忽略这条自动识别"
        style={({ pressed }) => [styles.ignore, pressed && styles.ignorePressed]}
      >
        <Text style={styles.ignoreText}>忽略</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  mainPressed: { opacity: 0.7 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 11, color: colors.primary },
  ignore: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  ignorePressed: { opacity: 0.5 },
  ignoreText: { fontSize: 12, color: colors.sub, fontWeight: '600' },
});
