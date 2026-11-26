import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cardShadow, colors, radius, spacing } from '../src/theme';

export const ONBOARDING_KEY = 'ledger.onboarded.v1';

const STEPS = [
  {
    title: '先开三个开关',
    body: '设置里依次打开：通知权限、通知使用权、读屏（或短信）。少一个，付款就记不上。',
  },
  {
    title: '付款不用管',
    body: '付完钱自动记一笔，屏幕顶部会冒出一条提示，点「餐饮 / 交通 / 购物」顺手改分类。',
  },
  {
    title: '想写备注就点提示条上的「备注」',
    body: '不点也没事，账已经记好了。事后要改：首页顶部会有「N 笔还没归类」，点进去逐条选。',
  },
];

/**
 * 首次使用说明。
 * 只在新装（本地还没有任何账）时出现一次，老用户升级不会被弹。
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const finish = useCallback(
    async (toSettings: boolean) => {
      try {
        await AsyncStorage.setItem(ONBOARDING_KEY, '1');
      } catch (error) {
        console.warn('[onboarding] 保存标记失败', error);
      }
      router.replace(toSettings ? '/settings' : '/');
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>三件事就够用了</Text>
        <Text style={styles.subtitle}>看一遍就会，不用记</Text>

        {STEPS.map((step, index) => (
          <View key={step.title} style={[styles.card, cardShadow]}>
            <View style={styles.stepHead}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            <Text style={styles.stepBody}>{step.body}</Text>
          </View>
        ))}

        <Pressable
          onPress={() => void finish(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>去设置里开权限</Text>
        </Pressable>

        <Pressable onPress={() => void finish(false)} hitSlop={8}>
          <Text style={styles.skip}>已经配好了，直接用</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.sub, textAlign: 'center', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  stepTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  stepBody: { fontSize: 13, lineHeight: 20, color: colors.sub, paddingLeft: 30 },
  button: {
    marginTop: spacing.lg,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  skip: { fontSize: 12, color: colors.sub, textAlign: 'center', paddingVertical: spacing.sm },
});
