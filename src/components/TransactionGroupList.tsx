import type { ReactElement } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { formatDateLabel } from '../lib/date';
import { formatYuan } from '../lib/money';
import { colors, radius, spacing } from '../theme';
import type { Transaction } from '../types';
import type { DaySection } from '../lib/group';
import { TransactionRow } from './TransactionRow';

interface Props {
  sections: DaySection[];
  /** 列表顶部（合计卡等） */
  header?: ReactElement | null;
  empty?: ReactElement | null;
  onPressItem: (item: Transaction) => void;
  onLongPressItem: (item: Transaction) => void;
  onDeleteItem: (item: Transaction) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * 按日期分组的账单列表：列表页与搜索页共用同一套样式，
 * 保证两处视觉完全一致（分组头、卡片圆角、分隔线都收在这里）。
 */
export function TransactionGroupList({
  sections,
  header,
  empty,
  onPressItem,
  onLongPressItem,
  onDeleteItem,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
}: Props) {
  return (
    <SectionList<Transaction, DaySection>
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[styles.listContent, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sub} />
        ) : undefined
      }
      ListHeaderComponent={header ?? undefined}
      ListEmptyComponent={empty ?? undefined}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{formatDateLabel(section.title)}</Text>
          <View style={styles.sectionSums}>
            {section.expenseCents > 0 ? (
              <Text style={[styles.sectionSum, { color: colors.expense }]}>
                支 {formatYuan(section.expenseCents, false)}
              </Text>
            ) : null}
            {section.incomeCents > 0 ? (
              <Text style={[styles.sectionSum, { color: colors.income }]}>
                收 {formatYuan(section.incomeCents, false)}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <View
          style={[
            styles.rowWrap,
            index === 0 && styles.rowWrapFirst,
            index === section.data.length - 1 && styles.rowWrapLast,
          ]}
        >
          <TransactionRow
            item={item}
            onPress={onPressItem}
            onLongPress={onLongPressItem}
            onDelete={onDeleteItem}
          />
          {index < section.data.length - 1 ? <View style={styles.separator} /> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: spacing.xs },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.sub },
  sectionSums: { flexDirection: 'row', gap: spacing.md },
  sectionSum: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowWrap: { marginHorizontal: spacing.lg, backgroundColor: colors.card, overflow: 'hidden' },
  rowWrapFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowWrapLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 66 },
});
