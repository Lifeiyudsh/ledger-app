import { NativeModule, requireNativeModule } from 'expo';

export type TransactionType = 'expense' | 'income';

export type TransactionPayload = {
  /** 解析出的金额，单位元 */
  amount: number;
  /** 解析出的金额，单位分 */
  amountFen: number;
  /** expense = 支出，income = 收入 */
  type: TransactionType;
  /** 命中的关键词 */
  keyword: string;
  /** 原始通知文本 */
  rawText: string;
  title: string;
  packageName: string;
  appName: string;
  postedAt: number;
};

/** 命中目标应用就上报的原文，不代表一定解析出了金额 */
export type RawNotificationPayload = {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  rawText: string;
  postedAt: number;
};

/** 原生侧持久化的通知日志条目（最近 50 条） */
export type DebugLogEntry = {
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
};

export type ServiceStatus = {
  isConnected: boolean;
};

export type NotificationListenerEvents = {
  onTransactionDetected: (payload: TransactionPayload) => void;
  onRawNotification: (payload: RawNotificationPayload) => void;
};

declare class NotificationListenerModule extends NativeModule<NotificationListenerEvents> {
  /** 是否已被授予「通知使用权」 */
  isPermissionGranted(): boolean;
  /** 跳转系统「通知使用权」设置页 */
  openNotificationSettings(): boolean;
  /** 重新向系统申请绑定监听服务（权限刚授予时用） */
  refreshBinding(): boolean;
  /** 读取最近 50 条通知日志，新的在前 */
  getLogs(): Promise<DebugLogEntry[]>;
  /** 清空日志 */
  clearLogs(): Promise<void>;
  /** 监听服务是否被系统绑定 */
  getServiceStatus(): Promise<ServiceStatus>;
  /** 仅调试用：伪造一条通知，走完整解析 + 落盘 + 事件链路 */
  simulate(text: string): boolean;
}

export default requireNativeModule<NotificationListenerModule>('NotificationListener');
