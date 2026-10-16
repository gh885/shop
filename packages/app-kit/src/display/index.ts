/**
 * display 展示胶水：拿不到 hook 的模块级表格列出口（TimeText/MoneyText，§3.5）、createImgUrl、copyWithNotify。
 * 金额格式化本体在 @shop/common/domain/money.ts（领域形状映射非胶水），这里只放「cell 不是组件」的组件出口。
 */
export { copyWithNotify } from "./copy-text"
export { formatDate, formatDateTime, formatTimeShort } from "./format"
export { TimeText } from "./time-text"
export { MoneyText } from "./money-text"
export { createImgUrl } from "./image"
