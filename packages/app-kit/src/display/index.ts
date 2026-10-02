/**
 * display —— 展示胶水：时间格式化与 TimeText、金额格式化与 MoneyText（两者都是「模块级表格列
 * 拿不到 hook」那档的出口，§3.5 约束 2）、createImgUrl（图片 URL 拼装策略）、
 * copyWithNotify（复制 + 反馈，要弹 toast 所以在这里）。
 *
 * 金额的**格式化函数本体**在 `@shop/common/domain` 的 `money.ts`（它是领域形状的映射，不是胶水）；
 * 这里只放那个「cell 不是组件」的组件出口。
 */
export { copyWithNotify } from "./copy-text"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { TimeText } from "./time-text"
export { MoneyText } from "./money-text"
export { createImgUrl } from "./image"
