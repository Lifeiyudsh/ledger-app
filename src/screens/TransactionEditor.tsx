import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
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
import { CategoryGrid } from '../components/CategoryGrid';
import { DateField } from '../components/DateField';
import { TypeSwitch } from '../components/TypeSwitch';
import {
  getCategories,
  getDefaultCategory,
  isCategoryAllowed,
  type CategoryKey,
} from '../constants/categories';
import { createTransaction, updateTransaction } from '../db/transactions';
import { isValidISODate, parseISODate, toISODate } from '../lib/date';
import { centsToFixed, parseAmountToCents } from '../lib/money';
import { clearPendingCapture } from '../lib/pendingCapture';
import { cardShadow, colors, directionColor, radius, spacing } from '../theme';
import type { Direction, Transaction } from '../types';

/** 通知监听自动识别出来的草稿（金额/日期/备注预填，分类必须用户自己选） */
export interface TransactionDraft {
  direction?: Direction;
  amountCents?: number;
  note?: string;
  /** 'YYYY-MM-DD' */
  date?: string;
}

interface Props {
  /** 传了就是编辑模式：表单回填该记录，保存走 UPDATE */
  initial?: Transaction;
  /** 传了就是「确认自动记账」模式：预填草稿，分类不预选 */
  preset?: TransactionDraft;
}

/** 记一笔 / 编辑记录 / 确认自动识别 共用的表单 */
export function TransactionEditor({ initial, preset }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const isDraft = !isEdit && Boolean(preset);

  const [direction, setDirection] = useState<Direction>(
    initial?.direction ?? preset?.direction ?? 'expense',
  );
  const [amountText, setAmountText] = useState(() => {
    if (initial) return centsToFixed(initial.amountCents);
    if (preset?.amountCents && preset.amountCents > 0) return centsToFixed(preset.amountCents);
    return '';
  });
  // null = 未选中（切换收支后原分类不适用时会被清空）
  const [category, setCategory] = useState<CategoryKey | null>(() => {
    // 自动识别只给了金额，分类必须由用户确认
    if (isDraft) return null;
    if (!initial) return getDefaultCategory('expense');
    // 历史脏数据（如收入 + 餐饮）回填时判为未选中，逼用户重选
    return isCategoryAllowed(initial.direction, initial.category) ? initial.category : null;
  });
  const [date, setDate] = useState<Date>(() => {
    if (initial) return parseISODate(initial.date) ?? new Date();
    if (preset?.date) return parseISODate(preset.date) ?? new Date();
    return new Date();
  });
  const [note, setNote] = useState(initial?.note ?? preset?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isoDate = toISODate(date);
  const categoryOptions = getCategories(direction);
  const canSave = amountText.trim().length > 0 && category !== null && !saving;

  /** 切换收支：分类表跟着换，原分类不属于新方向就清空，逼用户重选 */
  function handleDirectionChange(next: Direction) {
    setDirection(next);
    setCategory((prev) => (isCategoryAllowed(next, prev) ? prev : null));
    if (error) setError(null);
  }

  function handleAmountChange(text: string) {
    // 只允许数字和一个小数点，其余字符直接丢弃
    const cleaned = text.replace(/[^\d.]/g, '');
    const [intPart, ...rest] = cleaned.split('.');
    const normalized = rest.length > 0 ? `${intPart}.${rest.join('')}` : intPart;
    setAmountText(normalized);
    if (error) setError(null);
  }

  function handleSave() {
    Keyboard.dismiss();

    const parsed = parseAmountToCents(amountText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!category || !isCategoryAllowed(direction, category)) {
      setError('请选择分类');
      return;
    }
    // 业务层真实日期校验：拦截 2026-10-32 这类脏数据
    if (!isValidISODate(isoDate)) {
      setError('日期不合法，请重新选择');
      return;
    }

    setSaving(true);
    try {
      const payload = { direction, amountCents: parsed.cents, category, note, date: isoDate };
      if (initial) {
        const updated = updateTransaction(initial.id, payload);
        if (!updated) throw new Error('这条记录已不存在，可能已被删除');
      } else {
        createTransaction(payload);
        // 自动识别的那条已经落库，清掉待确认槽，横幅随之消失
        if (isDraft) clearPendingCapture();
      }
      router.back();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : '保存失败，请重试');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEdit ? '编辑记录' : isDraft ? '确认记账' : '记一笔'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <TypeSwitch value={direction} onChange={handleDirectionChange} />

          <View style={[styles.amountCard, cardShadow]}>
            <Text style={styles.amountLabel}>{direction === 'expense' ? '支出金额' : '收入金额'}</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.currency, { color: directionColor(direction) }]}>¥</Text>
              <TextInput
                value={amountText}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor="#c3c8d0"
                keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                inputMode="decimal"
                maxLength={12}
                // 编辑时已有金额，不自动弹键盘，避免遮住内容
                autoFocus={!isEdit && !isDraft}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[styles.amountInput, { color: directionColor(direction) }]}
                accessibilityLabel="金额"
              />
            </View>
            <Text style={styles.amountHint}>最多两位小数，按「分」精确存储</Text>
          </View>

          <Text style={styles.sectionTitle}>
            分类{category === null ? <Text style={styles.sectionHint}>（请重新选择）</Text> : null}
          </Text>
          <CategoryGrid
            options={categoryOptions}
            value={category}
            onChange={(next) => {
              setCategory(next);
              if (error) setError(null);
            }}
          />

          <Text style={styles.sectionTitle}>日期</Text>
          <DateField value={date} onChange={setDate} />

          <Text style={styles.sectionTitle}>备注</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="选填，比如「和同事吃午饭」"
            placeholderTextColor="#b6bcc6"
            style={styles.noteInput}
            maxLength={100}
            multiline
            textAlignVertical="top"
            accessibilityLabel="备注"
          />

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: directionColor(direction) },
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
          >
            <Text style={styles.saveText}>
              {isEdit ? '保存修改' : isDraft ? '确认记账' : '保存'}
            </Text>
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  amountCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  amountLabel: { fontSize: 12, color: colors.sub },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  currency: { fontSize: 28, fontWeight: '700' },
  amountInput: {
    flex: 1,
    fontSize: 38,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.sm,
  },
  amountHint: { fontSize: 11, color: colors.sub },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.sub,
    marginTop: spacing.xs,
  },
  sectionHint: { fontSize: 12, fontWeight: '400', color: colors.primary },
  noteInput: {
    minHeight: 88,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  error: { fontSize: 13, color: colors.expense, fontWeight: '500' },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnPressed: { opacity: 0.85 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
