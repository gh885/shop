import { CmsStatus } from "@shop/api/sdk"
import { format, isValid } from "date-fns"
import { z } from "zod"

/** 跳转目标类型：与后端三个 Request 的 @Pattern("PRODUCT|CATEGORY|CAMPAIGN|SEARCH|URL") 对齐 */
export const TargetTypeSchema = z.enum(["PRODUCT", "CATEGORY", "CAMPAIGN", "SEARCH", "URL"])
export type TargetType = z.infer<typeof TargetTypeSchema>

/** 表单 targetType 档位：契约里响应字段是 string | null 的宽松存储值，
    初始值不许裸断言收窄——过 schema 解析，脏值/缺省一律落回「NONE = 不跳转」。 */
const TargetTypeFieldSchema = TargetTypeSchema.or(z.literal("NONE"))
export function parseTargetType(value?: string | null): TargetType | "NONE" {
    const parsed = TargetTypeFieldSchema.safeParse(value)
    return parsed.success ? parsed.data : "NONE"
}

/** 提交方向与 parseTargetType 互为镜像：表单多出的 NONE 档位契约不认（只收五种类型），
    折成缺省 = 「不跳转」。三张表单各自折一次迟早会有一张忘折，把 "NONE" 原样发出去。 */
export function submitTargetType(value?: TargetType | "NONE"): TargetType | undefined {
    return value && value !== "NONE" ? value : undefined
}

const TARGET_TYPE_LABEL: Record<TargetType, string> = {
    PRODUCT: "商品",
    CATEGORY: "类目",
    CAMPAIGN: "活动",
    SEARCH: "搜索词",
    URL: "外链",
}

/** 跳转类型下拉选项（三张 CMS 表单共用）：首项 NONE = 不跳转 */
export const TARGET_TYPE_ITEMS = [
    { value: "NONE", label: "不跳转" },
    ...Object.entries(TARGET_TYPE_LABEL).map(([value, label]) => ({ value, label })),
]

/** 前台已消费的导航位 / 运营位（筛选下拉选项；新增位时在此扩充） */
export const CMS_NAV_KEYS = ["home"] as const
export const CMS_BANNER_SLOTS = ["home_promo"] as const

export const STATUS_BADGE: Record<CmsStatus, { label: string; variant: "success" | "secondary" }> =
    {
        ENABLED: { label: "启用中", variant: "success" },
        DISABLED: { label: "已停用", variant: "secondary" },
    }

/**
 * OffsetDateTime ISO ↔ datetime-local 输入值：两侧都按**本地墙上时钟**翻译，秒位丢弃。
 *
 * 回填方向曾因用 toISOString()（UTC）而与提交方向（本地）不对称：每「打开并保存」一次，
 * 上下线时间就往前挪一个时区差（+08 即 8 小时）。datetime-local 读的就是墙上时钟，故两侧同用 format。
 */
export const toDateTimeLocal = (iso?: string | null) => {
    if (!iso) return ""
    const d = new Date(iso)
    return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : ""
}

export const fromDateTimeLocal = (local: string) =>
    local ? new Date(local).toISOString() : undefined

/** 表单空串 → 契约缺省（后端把 null 与缺省一视同仁，统一发缺省） */
export const blankToUndefined = (s?: string) => s?.trim() || undefined
