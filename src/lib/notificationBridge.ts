import { requireNativeModule } from 'expo';
import { useEffect } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { pushCapture, type NotificationTransactionPayload } from './pendingCapture';

/**
 * 原生模块的安全入口。
 *
 * `modules/notification-listener` 只有 Android 实现，且 Expo Go 里不存在这个原生模块，
 * 所以这里必须 lazy + try/catch：拿不到就返回 null，功能静默降级，不能影响其他页面。
 */

type EventSubscription = { remove(): void };

/** 气泡点击后由原生落进队列的一条待入库记录 */
export interface PendingAutoRecord {
  id: string;
  amountFen: number;
  direction: 'income' | 'expense';
  note: string;
  rawText: string;
  appName: string;
  packageName: string;
  /** 通知发出时间（epoch ms） */
  postedAt: number;
  /** 用户点气泡的时间（epoch ms） */
  confirmedAt: number;
}

/**
 * 气泡确认事件。
 * `fallback === true` 表示原生队列写入失败，数据直接塞在事件里，JS 必须自己入库。
 */
export type OverlayConfirmedPayload = Partial<PendingAutoRecord> & { fallback?: boolean };

/** 原生返回的诊断快照 */
export interface OverlayDebugState {
  canDrawOverlays: boolean;
  isAppInForeground: boolean;
  lastDecision: string;
  lastDecisionAt: number;
  lastForegroundAtDecision: boolean | null;
  lastCanDrawAtDecision: boolean | null;
  /** 判定那一刻的原始生命周期标志位 */
  lastForegroundFlag: boolean | null;
  /** 判定那一刻的进程 importance（-1 = 取不到） */
  lastImportance: number;
  /** 结论由哪一路信号决定 */
  lastForegroundSource: string;
  /** importance 是从哪个 API 拿的 */
  lastImportanceSource: string;
  /** 读 importance 时所在进程名（服务未配 android:process，应等于包名） */
  lastProcessName: string;
  /** 最近一次写入标志位的来源（排查漏回调用） */
  lastEventSource: string;
  lastAddViewOk: boolean | null;
  lastError: string | null;
  lastWindowType: string;
  showAttempts: number;
  showSuccesses: number;
  lastNotificationText: string;
  pendingQueueSize: number;
  listenerConnected: boolean;
}

/** 用户在通知栏里点的分类修正 */
export interface CategoryFix {
  id: string;
  amountFen: number;
  /** 空串表示这次只改备注 */
  category: string;
  /** 空串表示这次只改分类 */
  note: string;
  at: number;
}

/** 原生持久化的通知日志条目（最近 50 条，含未命中） */
export interface NotificationLogEntry {
  timestamp: number;
  packageName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  tickerText: string;
  extrasDump: string;
  isMatch: boolean;
  amountFen: number | null;
  matchedKeyword: string;
}

/**
 * 只声明主项目真正用到的成员。
 * 不继承 `NativeModule` 是因为它在 expo 的类型里是「构造函数类型」，interface 继承拿不到实例方法。
 */
interface NotificationListenerNative {
  addListener(
    eventName: 'onTransactionDetected',
    listener: (payload: NotificationTransactionPayload) => void,
  ): EventSubscription;
  addListener(eventName: 'onRawNotification', listener: (payload: unknown) => void): EventSubscription;
  addListener(
    eventName: 'onOverlayConfirmed',
    listener: (payload: OverlayConfirmedPayload) => void,
  ): EventSubscription;
  isPermissionGranted(): boolean;
  openNotificationSettings(): boolean;
  refreshBinding(): boolean;
  canDrawOverlays(): boolean;
  requestOverlayPermission(): boolean;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): boolean;
  hasSmsPermission(): boolean;
  hasNotificationPermission(): boolean;
  showTestOverlay(): Promise<boolean>;
  startKeepAlive(): boolean;
  dismissOverlay(): boolean;
  setQuickCategories(json: string): boolean;
  isOverlayAlert(): boolean;
  setOverlayAlert(enabled: boolean): boolean;
  getCategoryFixes(): Promise<CategoryFix[]>;
  clearCategoryFixes(): Promise<void>;
  isAutoBookkeeping(): boolean;
  setAutoBookkeeping(enabled: boolean): boolean;
  /** 原生返回 JSON 字符串，由 JS 自己 parse（避免依赖 expo 的字典转换） */
  getDebugState(): string;
  setAppInForeground(foreground: boolean): boolean;
  getPendingAutoRecords(): Promise<PendingAutoRecord[]>;
  clearPendingAutoRecords(): Promise<void>;
  getLogs(): Promise<NotificationLogEntry[]>;
  clearLogs(): Promise<void>;
}

let cached: NotificationListenerNative | null | undefined;

export function getNotificationListener(): NotificationListenerNative | null {
  if (cached !== undefined) return cached;

  if (Platform.OS !== 'android') {
    cached = null;
    return cached;
  }

  try {
    cached = requireNativeModule<NotificationListenerNative>('NotificationListener');
  } catch {
    // Expo Go / 未打包含该模块的构建
    cached = null;
  }
  return cached;
}

/** 是否已被授予「通知使用权」 */
export function isNotificationPermissionGranted(): boolean {
  try {
    return getNotificationListener()?.isPermissionGranted() ?? false;
  } catch {
    return false;
  }
}

/** 跳到系统「通知使用权」设置页 */
export function openNotificationListenerSettings(): boolean {
  try {
    return getNotificationListener()?.openNotificationSettings() ?? false;
  } catch {
    return false;
  }
}

/** 是否已授予「显示在其他应用上层」（悬浮窗）权限 */
export function canDrawOverlays(): boolean {
  try {
    return getNotificationListener()?.canDrawOverlays() ?? false;
  } catch {
    return false;
  }
}

/** 跳系统「显示在其他应用上层」授权页 */
export function requestOverlayPermission(): boolean {
  try {
    return getNotificationListener()?.requestOverlayPermission() ?? false;
  } catch {
    return false;
  }
}

/** 读取气泡确认后待入库的记录（原生 SharedPreferences 队列） */
export async function getPendingAutoRecords(): Promise<PendingAutoRecord[]> {
  try {
    return (await getNotificationListener()?.getPendingAutoRecords()) ?? [];
  } catch {
    return [];
  }
}

/** 入库成功后清空队列 */
export async function clearPendingAutoRecords(): Promise<void> {
  try {
    await getNotificationListener()?.clearPendingAutoRecords();
  } catch {
    // 清空失败不阻塞主流程
  }
}

/** 订阅「气泡被点击」事件，返回取消订阅函数 */
export function subscribeOverlayConfirmed(
  listener: (payload: OverlayConfirmedPayload) => void,
): () => void {
  const native = getNotificationListener();
  if (!native) return () => {};

  try {
    const subscription = native.addListener('onOverlayConfirmed', listener);
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/**
 * 请求系统重新绑定通知监听服务。
 * 重装 App 后系统常出现「权限还在、服务没绑上」，这时调一次即可恢复。
 */
export function refreshListenerBinding(): boolean {
  try {
    return getNotificationListener()?.refreshBinding() ?? false;
  } catch {
    return false;
  }
}

/** 读取通知里点过的分类修正（读完后要调 clear） */
export async function getCategoryFixes(): Promise<CategoryFix[]> {
  try {
    return (await getNotificationListener()?.getCategoryFixes()) ?? [];
  } catch {
    return [];
  }
}

export async function clearCategoryFixes(): Promise<void> {
  try {
    await getNotificationListener()?.clearCategoryFixes();
  } catch {
    // 忽略
  }
}

/**
 * 自动记账（免确认）：捕获即写队列、JS 一有机会就入库，不用点气泡或横幅。
 * 关掉时走「气泡/横幅 → 点一下才入库」的老流程。
 */
export function isAutoBookkeeping(): boolean {
  try {
    return getNotificationListener()?.isAutoBookkeeping() ?? false;
  } catch {
    return false;
  }
}

export function setAutoBookkeeping(enabled: boolean): boolean {
  try {
    return getNotificationListener()?.setAutoBookkeeping(enabled) ?? false;
  } catch {
    return false;
  }
}

/** 「付款时顶部提示」开关（打开会常驻一条静默通知，这是系统强制要求） */
export function isOverlayAlert(): boolean {
  try {
    return getNotificationListener()?.isOverlayAlert() ?? true;
  } catch {
    return true;
  }
}

export function setOverlayAlert(enabled: boolean): boolean {
  try {
    return getNotificationListener()?.setOverlayAlert(enabled) ?? false;
  } catch {
    return false;
  }
}

/** 启动常驻前台服务，避免后台进程被冻结（悬浮条/计时器才可靠） */
export function startKeepAlive(): boolean {
  try {
    return getNotificationListener()?.startKeepAlive() ?? false;
  } catch {
    return false;
  }
}

/** 设置悬浮条上的三个快捷分类 */
export function setQuickCategories(items: ReadonlyArray<{ key: string; label: string }>): void {
  try {
    getNotificationListener()?.setQuickCategories(JSON.stringify(items));
  } catch {
    // 忽略
  }
}

/** 清掉残留的悬浮提示条（后台计时器被冻结时它不会自动消失） */
export function dismissOverlay(): void {
  try {
    getNotificationListener()?.dismissOverlay();
  } catch {
    // 忽略
  }
}

/** 弹一条测试用悬浮提示条，用来验证悬浮窗权限是否真的生效 */
export async function showTestOverlay(): Promise<boolean> {
  try {
    return (await getNotificationListener()?.showTestOverlay()) ?? false;
  } catch {
    return false;
  }
}

/** 是否有通知权限（没有的话「已记一笔」通知会被系统静默丢弃） */
export function hasNotificationPermission(): boolean {
  try {
    return getNotificationListener()?.hasNotificationPermission() ?? false;
  } catch {
    return false;
  }
}

/** 是否已授予短信权限（银行动账短信自动记账） */
export function hasSmsPermission(): boolean {
  try {
    return getNotificationListener()?.hasSmsPermission() ?? false;
  } catch {
    return false;
  }
}

/** 申请短信权限；用户拒绝返回 false */
export async function ensureSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (hasSmsPermission()) return true;

  try {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    return result[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** 读屏（无障碍）服务是否已开启 */
export function isAccessibilityEnabled(): boolean {
  try {
    return getNotificationListener()?.isAccessibilityEnabled() ?? false;
  } catch {
    return false;
  }
}

/** 跳系统「无障碍」设置页 */
export function openAccessibilitySettings(): boolean {
  try {
    return getNotificationListener()?.openAccessibilitySettings() ?? false;
  } catch {
    return false;
  }
}

/** 读取原生诊断快照（气泡没弹出来时用） */
export function getOverlayDebugState(): OverlayDebugState | null {
  try {
    const raw = getNotificationListener()?.getDebugState();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<OverlayDebugState> & { error?: string };
    if (parsed.error) {
      console.warn('[notification] 诊断快照异常', parsed.error);
      return null;
    }
    return parsed as OverlayDebugState;
  } catch {
    return null;
  }
}

/** 读取最近 50 条通知原文（含未命中），用于排查「为什么没反应」 */
export async function getNotificationLogs(): Promise<NotificationLogEntry[]> {
  try {
    return (await getNotificationListener()?.getLogs()) ?? [];
  } catch {
    return [];
  }
}

/** 清空通知日志 */
export async function clearNotificationLogs(): Promise<void> {
  try {
    await getNotificationListener()?.clearLogs();
  } catch {
    // 忽略
  }
}

/** 把 JS 的 AppState 同步给原生（和原生生命周期回调互为兜底） */
export function syncAppForeground(foreground: boolean): void {
  try {
    getNotificationListener()?.setAppInForeground(foreground);
  } catch {
    // 忽略：原生侧还有 ActivityLifecycleCallbacks 兜底
  }
}

/**
 * 在根组件里挂一次：把原生抛上来的捕获写进待确认槽（不落库）。
 */
export function useNotificationCapture(): void {
  useEffect(() => {
    const listener = getNotificationListener();
    if (!listener) return;

    const subscription = listener.addListener('onTransactionDetected', (payload) => {
      try {
        pushCapture(payload);
      } catch (error) {
        console.warn('[notification] 处理捕获失败', error);
      }
    });

    // 兜底：JS 侧对前后台的判断比原生更准，同步过去
    syncAppForeground(AppState.currentState === 'active');
    const appStateSub = AppState.addEventListener('change', (state) => {
      syncAppForeground(state === 'active');
    });

    return () => {
      subscription.remove();
      appStateSub.remove();
    };
  }, []);
}
