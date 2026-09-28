/** 构建时 VITE_DISABLE_REGISTER=1 则关闭注册入口（演示站防灌） */
export const registerEnabled = import.meta.env.VITE_DISABLE_REGISTER !== '1'
