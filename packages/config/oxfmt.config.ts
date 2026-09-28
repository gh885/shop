import type { OxfmtConfig } from "vite-plus/fmt"

/** 由根 `vite.config.ts` 的 `fmt` 块消费（Vite+ 要求格式化设置只住在根配置里）。 */
export const oxfmtConfig = {
    tabWidth: 4,
    singleAttributePerLine: true,
    semi: false,
} satisfies OxfmtConfig
