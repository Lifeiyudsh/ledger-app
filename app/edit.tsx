import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTransactionById } from '../src/db/transactions';
import { TransactionEditor } from '../src/screens/TransactionEditor';
import { colors, radius, spacing } from '../src/theme';

/** /edit?id=12 —— 读出记录后交给共用的表单组件 */
export default function EditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  // 同页内不需要重新读取，用惰性初始化只查一次库
  const [transaction] = useState(() => {
    const numericId = Number(id);
    return Number.isInteger(numericId) ? getTransactionById(numericId) : null;
  });

  if (!transaction) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>记录不存在</Text>
          <Text style={styles.emptyHint}>可能已经被删除了</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <Text style={styles.backText}>返回列表</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <TransactionEditor initial={transaction} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.sub },
  backBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { opacity: 0.85 },
  backText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
