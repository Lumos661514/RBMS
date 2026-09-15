/** 一格对应的小时数；改这里会改变行的疏密（第一版只按整数小时用）。 */
export const SLOT_HOURS = 1

/** 当天第一格开始的整点（含）。 */
export const START_HOUR = 9

/** 当天营业结束整点（不含，最后一格是 END_HOUR - SLOT_HOURS）。 */
export const END_HOUR = 18

/**
 * 出表的星期列。0 为周日。
 * 默认不含 0，即周日不营业；数组里加上 0 就会多一列。
 */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6]

/** 表头展示用，与 JS getDay() 的 0–6 对齐。 */
export const WEEKDAY_LABELS = {
  /** 周日 */
  0: '周日',
  /** 周一 */
  1: '周一',
  /** 周二 */
  2: '周二',
  /** 周三 */
  3: '周三',
  /** 周四 */
  4: '周四',
  /** 周五 */
  5: '周五',
  /** 周六 */
  6: '周六',
}
