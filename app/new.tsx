import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { TransactionEditor, type TransactionDraft } from '../src/screens/TransactionEditor';
import { isValidISODate } from '../src/lib/date';
import type { Direction } from '../src/types';

/**
 * 记一笔。
 * 支持从「通知监听」的待确认横幅带参数进来：/new?amountCents=2500&date=2026-10-30&note=星巴克&direction=expense
 * 只预填金额/日期/备注，分类一律让用户自己选。
 */
export default function NewScreen() {
  const params = useLocalSearchParams<{
    amountCents?: string;
    date?: string;
    note?: string;
    direction?: string;
  }>();

  const preset = useMemo<TransactionDraft | undefined>(() => {
    const cents = Number(params.amountCents);
    const hasAmount = Number.isSafeInteger(cents) && cents > 0;

    if (!hasAmount) return undefined;

    const direction: Direction = params.direction === 'income' ? 'income' : 'expense';
    const date = typeof params.date === 'string' && isValidISODate(params.date) ? params.date : undefined;
    const note = typeof params.note === 'string' ? params.note.slice(0, 100) : undefined;

    return {
      amountCents: cents,
      direction,
      date,
      note,
    };
  }, [params.amountCents, params.date, params.direction, params.note]);

  return <TransactionEditor preset={preset} />;
}
