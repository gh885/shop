import { statusOptions } from "@shop/common"
import { CmsStatus } from "@shop/api/sdk"
import { format, isValid } from "date-fns"
import { z } from "zod"

/**
 * 运营位表单的字数上限：镜像后端 `cms/dto/CmsFieldRules`（三个 Request + NavGroup 共用一份）。
 *
 * 三个表单此前把 `maxLength={64}` 抄了四遍、`{32}` 抄了两遍，数字相同但**不保证是同一个概念**：
 * 主/副标题那一档（64/128）在 banner 与导航两个弹窗里是同一格；词条名（32）与定位码（32）只是撞数，
 * 所以分开命名——合并成一个常量就等于「放宽词条名会连带改窄 slot 码」。
 * 等值与方向（app 侧只许等于或严于契约）由 `FieldRuleVocabularyTest` 的镜像表核对。
 */
export const CMS_TITLE_MAX = 64
export const CMS_SUBTITLE_MAX = 128
export const CMS_TAB_NAME_MAX = 32

/** 定位码上限（`slot` / `navKey` / `iconKey`）：运营手填的机器可读码，与词条名 32 撞数但是两个概念 */
export const CMS_KEY_MAX = 32

/**
 * 一个导航条目最多挂几个分组（契约 `NavRequest.subs.maxItems`）：分组编辑器拿它当按钮 disable 门槛
 * 并在文案里显示 `n/30`，两处此前各写一遍字面量 30——契约那格放宽一次，界面上就会出现「加不进去却说还能加」。
 */
export const CMS_SUB_GROUPS_MAX = 30

/**
 * 跳转目标上限（字）：镜像契约三个 Request 的 `target`（三张表都落 `VARCHAR(255)`）。
 * 与 {@link CMS_URL_MAX} 是两格：`target` 装的是类目/商品 id、搜索词或活动码这类**机器可读**的定位值，
 * 真正的任意 URL 在 banner 上另有 `link` 那一格（`target_type=URL` 时才用）。合并成一个常量，
 * 日后放宽外链长度会连带把定位码那一格写进契约里从没人读的地方。
 */
export const CMS_TARGET_MAX = 255

/** 外链上限（字）：banner 图片地址与跳转链接同一档（列宽 512） */
export const CMS_URL_MAX = 512

/** 跳转目标类型：与后端三个 Request 的 @Pattern("PRODUCT|CATEGORY|CAMPAIGN|SEARCH|URL") 对齐 */
const TargetTypeSchema = z.enum(["PRODUCT", "CATEGORY", "CAMPAIGN", "SEARCH", "URL"])
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
function submitTargetType(value?: TargetType | "NONE"): TargetType | undefined {
    return value && value !== "NONE" ? value : undefined
}

const TARGET_TYPE_LABEL: Record<TargetType, string> = {
    PRODUCT: "商品",
    CATEGORY: "类目",
    CAMPAIGN: "活动",
    SEARCH: "搜索词",
    URL: "外链",
}

/** 跳转类型下拉选项（三张 CMS 表单共用）：首项 NONE = 不跳转，其余全量取自词表 */
export const TARGET_TYPE_ITEMS = [
    { value: "NONE", label: "不跳转" },
    ...statusOptions(TARGET_TYPE_LABEL),
]

/**
 * 「跳转 + 排序」三个字段的公共片段：三张表单里同形同校验（target 上限 {@link CMS_TARGET_MAX}、排序非负整数）。
 * 抄三份的坏处不是行数，是将来放宽 target 长度时只改了一张表——同一个业务规则在系统里
 * 有两种答案。
 */
export const CmsTargetSortSchema = z.object({
    targetType: TargetTypeSchema.or(z.literal("NONE")).optional(),
    target: z.string().trim().max(CMS_TARGET_MAX).optional(),
    sortOrder: z.string().trim().regex(/^\d*$/, "排序需为非负整数"),
})

export type CmsTargetSortValues = z.infer<typeof CmsTargetSortSchema>

/** 契约行里的这三列（响应侧 target/targetType 恒为 string | null） */
type CmsTargetSortRow = {
    target?: string | null
    targetType?: string | null
    sortOrder?: number
}

/** 响应行 → 表单初值（脏 targetType 落回 NONE，缺排序落回 "0"） */
export function targetSortDefaults(row?: CmsTargetSortRow): CmsTargetSortValues {
    return {
        targetType: parseTargetType(row?.targetType),
        target: row?.target ?? "",
        sortOrder: String(row?.sortOrder ?? 0),
    }
}

/** 表单值 → 请求体三字段：NONE 与空串都折成缺省（见 submitTargetType） */
export function toTargetSortFields(values: CmsTargetSortValues) {
    return {
        targetType: submitTargetType(values.targetType),
        target: blankToUndefined(values.target),
        sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    }
}

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
