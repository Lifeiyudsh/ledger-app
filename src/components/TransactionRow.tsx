import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCategory } from '../constants/categories';
import { formatYuan } from '../lib/money';
import { colors, directionColor, radius, spacing } from '../theme';
import type { Transaction } from '../types';

interface Props {
  item: Transaction;
  /** 点整行进编辑 */
  onPress: (item: Transaction) => void;
  /** 长按弹操作菜单（编辑 / 删除） */
  onLongPress: (item: Transaction) => void;
  /** 点右侧 × 直接删 */
  onDelete: (item: Transaction) => void;
}

export function TransactionRow({ item, onPress, onLongPress, onDelete }: Props) {
  const category = getCategory(item.category);
  const isIncome = item.direction === 'income';
  const amountText = `${isIncome ? '+' : '-'}${formatYuan(item.amountCents)}`;

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${category.label} ${amountText}，点按编辑，长按更多操作`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{category.emoji}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.category}>{category.label}</Text>
        {item.note ? (
          <Text style={styles.note} numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.amount, { color: directionColor(item.direction) }]}>{amountText}</Text>

      <Pressable
        onPress={() => onDelete(item)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`删除 ${category.label} ${amountText}`}
        style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
      >
        <Text style={styles.deleteIcon}>×</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: '#fafbfc' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  middle: { flex: 1, gap: 2 },
  category: { fontSize: 15, fontWeight: '600', color: colors.text },
  note: { fontSize: 12, color: colors.sub },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: { backgroundColor: '#fdecec' },
  deleteIcon: { fontSize: 20, color: colors.sub, lineHeight: 22 },
});
