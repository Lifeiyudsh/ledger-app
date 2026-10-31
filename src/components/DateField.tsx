import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatFullDate, toISODate } from '../lib/date';
import { colors, radius, spacing } from '../theme';

interface Props {
  value: Date;
  onChange: (value: Date) => void;
}

/**
 * 日期选择行：
 * - Android 用系统对话框，选完即关；
 * - iOS 用内联 spinner，点「完成」收起。
 */
export function DateField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && selected) onChange(selected);
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={`记账日期 ${formatFullDate(toISODate(value))}`}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
      >
        <Text style={styles.fieldText}>{formatFullDate(toISODate(value))}</Text>
        <Text style={styles.chevron}>{open ? '收起' : '修改'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            locale="zh-CN"
            themeVariant="light"
            onChange={handleChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setOpen(false)} style={styles.doneBtn}>
              <Text style={styles.doneText}>完成</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  fieldPressed: { opacity: 0.7 },
  fieldText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  chevron: { fontSize: 13, color: colors.primary },
  pickerWrap: { marginTop: spacing.sm, backgroundColor: colors.inputBg, borderRadius: radius.md, paddingBottom: spacing.sm },
  doneBtn: { alignSelf: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  doneText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
