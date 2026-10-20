import { compactCount } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

/** 本域展示函数的出口：收藏数折位成展示文本。常量在 constants.ts，判定在 rules.ts */

export function collectCount(count: number, locale: AppLocale): string {
    return compactCount(count, locale)
}
