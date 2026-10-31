import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { Direction } from '../types';

interface Props {
  value: Direction;
  onChange: (value: Direction) => void;
}

const OPTIONS: ReadonlyArray<{ key: Direction; label: string; activeColor: string }> = [
  { key: 'expense', label: '支出', activeColor: colors.expense },
  { key: 'income', label: '收入', activeColor: colors.income },
];

/** 支出 / 收入 二选一 */
export function TypeSwitch({ value, onChange }: Props) {
  return (
    <View style={styles.track}>
      {OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.item,
              active && { backgroundColor: option.activeColor },
              pressed && !active && styles.itemPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: radius.pill,
    padding: 4,
    gap: spacing.xs,
  },
  item: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: { opacity: 0.6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.sub },
  labelActive: { color: '#ffffff' },
});
