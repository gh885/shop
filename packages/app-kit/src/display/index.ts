/**
 * display —— 展示胶水：时间格式化与 TimeText（按 locale 展示，金额那族在 @shop/common/domain 的 money.ts）、
 * createImgUrl（图片 URL 拼装策略）、copyWithNotify（复制 + 反馈，要弹 toast 所以在这里）。
 */
export { copyWithNotify } from "./copy-text"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { TimeText } from "./time-text"
export { createImgUrl } from "./image"
