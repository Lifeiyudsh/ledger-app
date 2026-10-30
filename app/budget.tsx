import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMonthSummary } from '../src/db/transactions';
import { clearBudgetCents, getBudgetCents, isValidMonthKey, setBudgetCents } from '../src/lib/budget';
import { currentMonthKey, formatMonthLabel } from '../src/lib/date';
import { centsToFixed, formatYuan, parseAmountToCents } from '../src/lib/money';
import { cardShadow, colors, radius, spacing } from '../src/theme';

export default function BudgetScreen() {
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month?: string }>();

  const targetMonth = typeof month === 'string' && isValidMonthKey(month) ? month : currentMonthKey();

  const [amountText, setAmountText] = useState('');
  const [existingCents, setExistingCents] = useState<number | null>(null);
  const [spentCents, setSpentCents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 本月已支出（SQLite，同步读）
    setSpentCents(getMonthSummary(targetMonth).expenseCents);

    let alive = true;
    getBudgetCents(targetMonth).then((cents) => {
      if (!alive) return;
      setExistingCents(cents);
      if (cents !== null) setAmountText(centsToFixed(cents));
    });
    return () => {
      alive = false;
    };
  }, [targetMonth]);

  function handleAmountChange(text: string) {
    // 只允许数字和一个小数点
    const cleaned = text.replace(/[^\d.]/g, '');
    const [intPart, ...rest] = cleaned.split('.');
    setAmountText(rest.length > 0 ? `${intPart}.${rest.join('')}` : intPart);
    if (error) setError(null);
  }

  function handleSave() {
    Keyboard.dismiss();

    const parsed = parseAmountToCents(amountText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSaving(true);
    setBudgetCents(targetMonth, parsed.cents)
      .then(() => router.back())
      .catch((e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : '保存失败，请重试');
      });
  }

  function handleClear() {
    Alert.alert('清除预算？', `将删除 ${formatMonthLabel(targetMonth)} 的预算设置`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: () => {
          clearBudgetCents(targetMonth)
            .then(() => router.back())
            .catch((e: unknown) => {
              Alert.alert('清除失败', e instanceof Error ? e.message : '请重试');
            });
        },
      },
    ]);
  }

  const canSave = amountText.trim().length > 0 && !saving;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
        <Text style={styles.headerTitle}>预算设置</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.month}>{formatMonthLabel(targetMonth)}</Text>
          <Text style={styles.monthHint}>预算只对该月份生效，可随时修改或清除</Text>

          <View style={[styles.amountCard, cardShadow]}>
            <Text style={styles.amountLabel}>月度总预算</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>¥</Text>
              <TextInput
                value={amountText}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor="#c3c8d0"
                keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                inputMode="decimal"
                maxLength={12}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={styles.amountInput}
                accessibilityLabel="月度总预算金额"
              />
            </View>
            <Text style={styles.amountHint}>
              已支出 {formatYuan(spentCents)}，按「分」精确存储
            </Text>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          {existingCents !== null ? (
            <Pressable
              onPress={handleClear}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
            >
              <Text style={styles.clearText}>清除该月预算（当前 {formatYuan(existingCents)}）</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
          >
            <Text style={styles.saveText}>保存</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  cancel: { fontSize: 15, color: colors.sub },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  headerRight: { width: 32 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  month: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  monthHint: { fontSize: 12, color: colors.sub, marginTop: -spacing.xs },
  amountCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  amountLabel: { fontSize: 12, color: colors.sub },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  currency: { fontSize: 26, fontWeight: '700', color: colors.primary },
  amountInput: {
    flex: 1,
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.sm,
  },
  amountHint: { fontSize: 11, color: colors.sub },
  error: { fontSize: 13, color: colors.expense, fontWeight: '500' },
  clearBtn: {
    marginTop: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnPressed: { backgroundColor: colors.inputBg },
  clearText: { fontSize: 14, color: colors.sub },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  saveBtn: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnPressed: { opacity: 0.85 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
