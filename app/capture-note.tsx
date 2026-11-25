import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { patchRecentByAmount } from '../src/db/transactions';
import { toISODate } from '../src/lib/date';
import { formatYuan } from '../src/lib/money';
import { colors, radius, spacing } from '../src/theme';

/**
 * 从「已记一笔」通知点进来的极简备注页。
 * 只做一件事：给刚记的那笔写个备注，写完就回列表。
 */
export default function CaptureNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ amount?: string; capture?: string }>();

  const amountFen = Number(params.amount ?? 0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const handleSave = useCallback(() => {
    if (saving) return;
    const text = note.trim();
    if (text.length === 0) {
      close();
      return;
    }

    setSaving(true);
    try {
      const since = toISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      patchRecentByAmount(amountFen, { note: text }, since);
    } catch (error) {
      console.warn('[capture-note] 写备注失败', error);
    } finally {
      setSaving(false);
      close();
    }
  }, [amountFen, close, note, saving]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="关闭"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          >
            <Ionicons name="close" size={22} color={colors.sub} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>已记一笔</Text>
          <Text style={styles.amount}>{formatYuan(amountFen)}</Text>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="备注，比如「午饭」"
            placeholderTextColor="#b6bcc6"
            style={styles.input}
            maxLength={100}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            accessibilityLabel="备注"
          />

          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{note.trim() ? '保存备注' : '跳过'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { height: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { backgroundColor: colors.inputBg },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  label: { fontSize: 13, color: colors.sub },
  amount: { fontSize: 40, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  input: {
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  saveBtn: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: { opacity: 0.85 },
  saveText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
