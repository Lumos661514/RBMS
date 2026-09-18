/** 默认每格分钟数（1 小时一格）。 */
export const SLOT_MINUTES_DEFAULT = 60

/** 时间段最短单位：30 分钟。 */
export const SLOT_MINUTES_MIN = 30

/** 时间段步进：只能是 30 的倍数。 */
export const SLOT_MINUTES_STEP = 30

/** 兼容旧代码：默认一格对应小时数。 */
export const SLOT_HOURS = SLOT_MINUTES_DEFAULT / 60

/** 当天第一格开始的整点（含）。 */
export const START_HOUR = 9

/** 当天营业结束整点（不含）。 */
export const END_HOUR = 18

/** 看板最少列数：从今天起至少展示一周。 */
export const DAY_COUNT_MIN = 7

/** 看板默认列数；设置里可往上加，不设上限。 */
export const DAY_COUNT_DEFAULT = 7

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
