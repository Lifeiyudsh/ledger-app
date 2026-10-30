import { isCategoryAllowed, type CategoryKey } from '../constants/categories';

/**
 * 关键词 → 分类 的智能映射（纯函数，不碰数据库/原生，方便单测）。
 * 命中不了就归「其他」，不会因为分类不合法导致入库失败。
 */

interface CategoryRule {
  category: CategoryKey;
  keywords: readonly string[];
}

/** 支出：按商户名 / 通知文本猜分类 */
const EXPENSE_RULES: readonly CategoryRule[] = [
  {
    category: 'food',
    keywords: [
      '美团', '饿了么', '外卖', '餐厅', '饭店', '食堂', '小吃', '快餐',
      '肯德基', '麦当劳', '星巴克', '瑞幸', '咖啡', '奶茶', '火锅', '烧烤',
      '面包', '早饭', '午饭', '晚饭', '夜宵',
    ],
  },
  {
    category: 'transport',
    keywords: [
      '滴滴', '打车', '出租车', '地铁', '公交', '高铁', '火车', '12306',
      '加油', '停车', '单车', '哈啰', '青桔', '过路费', '高速',
    ],
  },
  {
    category: 'shopping',
    keywords: ['淘宝', '天猫', '京东', '拼多多', '唯品会', '苏宁', '商城', '旗舰店', '网购'],
  },
  { category: 'housing', keywords: ['房租', '租金', '物业', '水费', '电费', '燃气', '宽带', '供暖'] },
  { category: 'daily', keywords: ['便利店', '超市', '日用品', '纸巾', '洗衣', '理发', '快递'] },
  {
    category: 'entertainment',
    keywords: ['电影', '影院', '影城', '游戏', '网吧', 'KTV', '演出', '门票', '会员', '视频', '音乐'],
  },
  { category: 'medical', keywords: ['医院', '药房', '药店', '挂号', '诊所', '体检', '医保'] },
  { category: 'study', keywords: ['书店', '图书', '学费', '培训', '课程', '文具', '考试'] },
];

/** 收入：注意只能用收入分类（工资/奖金/理财/兼职/退款/其他） */
const INCOME_RULES: readonly CategoryRule[] = [
  { category: 'salary', keywords: ['工资', '薪资', '代发'] },
  { category: 'bonus', keywords: ['奖金', '年终奖', '奖励'] },
  { category: 'investment', keywords: ['理财', '利息', '基金', '分红', '收益'] },
  { category: 'parttime', keywords: ['兼职', '稿费', '劳务'] },
  { category: 'refund', keywords: ['退款', '退回', '退货'] },
];

/**
 * 关键词 → 分类。
 * 最后统一走 isCategoryAllowed 校验：万一以后分类表调整，这里也不会写出跨方向的脏数据。
 */
export function guessCategory(text: string, direction: 'income' | 'expense'): CategoryKey {
  const haystack = text ?? '';
  const rules = direction === 'income' ? INCOME_RULES : EXPENSE_RULES;

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return isCategoryAllowed(direction, rule.category) ? rule.category : 'other';
    }
  }

  return 'other';
}
