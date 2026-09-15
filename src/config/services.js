/** 服务种类与耗时；换行业只改 name / durationHours，看板逻辑不改。 */
export const SERVICES = [
  {
    /** Mock 与提交预约时用的服务 id */
    id: 's1',
    /** 列表展示名，先不绑真实行业 */
    name: '服务1',
    /** 从开始整点起连续占用的小时数 */
    durationHours: 1,
  },
  {
    /** Mock 与提交预约时用的服务 id */
    id: 's2',
    /** 列表展示名，先不绑真实行业 */
    name: '服务2',
    /** 从开始整点起连续占用的小时数 */
    durationHours: 2,
  },
]

/**
 * 按 id 取服务配置。
 * @param {string} id
 */
export function getServiceById(id) {
  return SERVICES.find((item) => item.id === id) || null
}
