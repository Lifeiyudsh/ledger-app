import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cardShadow, colors, radius, spacing } from '../src/theme';

export const ONBOARDING_KEY = 'ledger.onboarded.v1';

const STEPS = [
  {
    icon: 'notifications-outline' as const,
    title: '先开三个开关',
    body: '设置里依次打开：通知权限、通知使用权、读屏（或短信）。少了任何一个，付款都记不上。',
  },
  {
    icon: 'card-outline' as const,
    title: '付款不用管',
    body: '付完钱会自动记一笔。顶部会冒出一条提示，点「餐饮 / 交通 / 购物」就能顺手改分类。',
  },
  {
    icon: 'create-outline' as const,
    title: '想写备注就点提示条上的「备注」',
    body: '不点也没关系，账已经记好了。事后改的话：首页顶部会有「N 笔还没归类」，点进去逐条选就行。',
  },
];

/** 首次启动的引导页（只出现一次） */
export default function WelcomeScreen() {
  const router = useRouter();

  const finish = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch (error) {
      console.warn('[onboarding] 保存标记失败', error);
    }
    router.replace('/');
  }, [router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>三件事就够用了</Text>
        <Text style={styles.subtitle}>不用学，看一遍就会</Text>

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
          onPress={() => void finish()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>开始使用</Text>
        </Pressable>

        <Pressable onPress={() => void finish()} hitSlop={8}>
          <Text style={styles.skip}>先随便看看</Text>
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
