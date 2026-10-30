import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';

export interface ActionMenuItem {
  key: string;
  label: string;
  hint?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  items: ActionMenuItem[];
  onClose: () => void;
}

/**
 * 底部操作菜单。
 * 不用 Alert：Android 的 Alert 最多 3 个按钮，多出来的会被静默丢弃。
 */
export function ActionMenu({ visible, title, items, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭菜单">
        {/* 阻止点击面板时穿透到背景 */}
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}
          onPress={() => {}}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}

          {items.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              >
                <Text style={[styles.itemLabel, item.destructive && styles.itemDestructive]}>
                  {item.label}
                </Text>
                {item.hint ? <Text style={styles.itemHint}>{item.hint}</Text> : null}
              </Pressable>
            </View>
          ))}

          <View style={styles.cancelGap} />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, styles.cancelItem, pressed && styles.itemPressed]}
          >
            <Text style={styles.cancelLabel}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11, 18, 32, 0.35)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: 12,
    color: colors.sub,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  item: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  itemPressed: { backgroundColor: colors.inputBg },
  itemLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  itemDestructive: { color: colors.expense },
  itemHint: { fontSize: 12, color: colors.sub, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  cancelGap: { height: spacing.sm, backgroundColor: colors.bg },
  cancelItem: { backgroundColor: colors.card },
  cancelLabel: { fontSize: 16, fontWeight: '600', color: colors.sub },
});
