import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDb } from '../src/db';
import { useAutoBookkeeping } from '../src/lib/autoBookkeeping';
import { useNotificationCapture } from '../src/lib/notificationBridge';
import { colors } from '../src/theme';

export default function RootLayout() {
  // 冷启动即建表/升级；数据库单例由 src/db 懒加载兜底，此处失败不会阻塞渲染
  useEffect(() => {
    initDb();
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
        {/* 预算设置页自带头部（取消 / 标题 / 保存） */}
        <Stack.Screen name="budget" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
