import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, CategoryKey } from '../constants/categories';
import { colors, radius, spacing } from '../theme';

interface Props {
  /** 当前方向可选的分类表（由表单页按 direction 传入） */
  options: readonly Category[];
  /** null 表示尚未选中（切换收支后清空的情况） */
  value: CategoryKey | null;
  onChange: (value: CategoryKey) => void;
}

/** 分类网格：3 列，选项随收支方向切换 */
export function CategoryGrid({ options, value, onChange }: Props) {
  return (
    <View style={styles.grid}>
      {options.map((category) => {
        const active = category.key === value;
        return (
          <Pressable
            key={category.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(category.key)}
            style={({ pressed }) => [
              styles.cell,
              active && styles.cellActive,
              pressed && !active && styles.cellPressed,
            ]}
          >
            <Text style={styles.emoji}>{category.emoji}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{category.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    // 3 列：减去两个 gap 后平分
    width: '31.5%',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  cellPressed: { opacity: 0.6 },
  emoji: { fontSize: 20 },
  label: { fontSize: 13, color: colors.sub, fontWeight: '500' },
  labelActive: { color: colors.primary, fontWeight: '600' },
});
