import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDb } from '../src/db';
import { getCategoryLabel } from '../src/constants/categories';
import { getTopExpenseCategories } from '../src/db/transactions';
import { dismissOverlay, setQuickCategories, startKeepAlive } from '../src/lib/notificationBridge';
import { useAutoBookkeeping } from '../src/lib/autoBookkeeping';
import { useNotificationCapture } from '../src/lib/notificationBridge';
import { colors } from '../src/theme';

export default function RootLayout() {
  // 冷启动即建表/升级；数据库单例由 src/db 懒加载兜底，此处失败不会阻塞渲染
  useEffect(() => {
    initDb();
    // 常驻前台服务：否则后台被冻结，悬浮条要等打开 App 才「补」出来
    startKeepAlive();

    // 悬浮条上的三个分类按「最近 30 天最常用」排序，而不是写死
    const syncQuickCategories = () => {
      try {
        const top = getTopExpenseCategories(30, 3);
        if (top.length === 0) return;
        setQuickCategories(
          top.map((item) => ({ key: item.category, label: getCategoryLabel(item.category) })),
        );
      } catch (error) {
        console.warn('[quick-categories] 同步失败', error);
      }
    };
    syncQuickCategories();

    // 后台计时器可能被冻结，导致悬浮条赖着不走；回到前台就清掉残留
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        dismissOverlay();
        syncQuickCategories();
      }
    });
    return () => sub.remove();
  }, []);

  // 通知监听：把原生抛上来的捕获放进「待确认」槽（不落库）
  useNotificationCapture();

  // 悬浮窗气泡确认后的自动补录（启动 / 回到前台 / 收到事件都会 drain 一次）
  useAutoBookkeeping();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontWeight: '600' },
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '账单' }} />
        {/* 表单页（新建 / 编辑）自带头部（取消 / 标题 / 保存），故隐藏原生 header */}
        <Stack.Screen name="new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="edit" options={{ headerShown: false, presentation: 'modal' }} />
        {/* 搜索页自带头部（返回 + 搜索框），用普通 push 保留返回手势 */}
        <Stack.Screen name="search" options={{ headerShown: false }} />
        {/* 统计页同理 */}
        <Stack.Screen name="statistics" options={{ headerShown: false }} />
        {/* 通知原文调试页 */}
        <Stack.Screen name="notif-log" options={{ headerShown: false }} />
        {/* 首次使用说明（只对空账本的新用户弹一次） */}
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        {/* 待归类（自动记账里分类落在「其他」的记录） */}
        <Stack.Screen name="tidy" options={{ headerShown: false }} />
        {/* 从「已记一笔」通知点进来的极简备注页 */}
        <Stack.Screen name="capture-note" options={{ headerShown: false, presentation: 'modal' }} />
        {/* 分类明细（从报表点进来） */}
        <Stack.Screen name="category" options={{ headerShown: false }} />
        {/* 设置与账单导入 */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ headerShown: false }} />
        {/* 预算设置页自带头部（取消 / 标题 / 保存） */}
        <Stack.Screen name="budget" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
