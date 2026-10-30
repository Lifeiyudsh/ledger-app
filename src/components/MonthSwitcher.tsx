import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMonthLabel, isCurrentMonth, shiftMonth } from '../lib/date';
import { colors, radius, spacing } from '../theme';

interface Props {
  /** 'YYYY-MM' */
  month: string;
  onChange: (month: string) => void;
}

/** 月份切换：< 2026年10月 >，不允许翻到未来月份 */
export function MonthSwitcher({ month, onChange }: Props) {
  const canGoNext = !isCurrentMonth(month);

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => onChange(shiftMonth(month, -1))}
        accessibilityRole="button"
        accessibilityLabel="上个月"
        hitSlop={8}
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>

      <View style={styles.labelWrap}>
        <Text style={styles.label} accessibilityRole="header">
          {formatMonthLabel(month)}
        </Text>
      </View>

      <Pressable
        onPress={() => onChange(shiftMonth(month, 1))}
        disabled={!canGoNext}
        accessibilityRole="button"
        accessibilityLabel="下个月"
        accessibilityState={{ disabled: !canGoNext }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.arrow,
          pressed && canGoNext && styles.arrowPressed,
          !canGoNext && styles.arrowDisabled,
        ]}
      >
        <Text style={[styles.arrowText, !canGoNext && styles.arrowTextDisabled]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  arrow: {
    width: 44,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: { backgroundColor: colors.inputBg },
  arrowDisabled: { opacity: 0.35 },
  arrowText: { fontSize: 24, lineHeight: 28, color: colors.text, fontWeight: '500' },
  arrowTextDisabled: { color: colors.sub },
  labelWrap: { flex: 1, alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
});
