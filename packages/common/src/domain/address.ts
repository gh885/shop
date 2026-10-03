/**
 * address —— 地址字段口径 + 「省市区名」派生，web 收货地址与 seller 商家地址共用一份。
 *
 * 两端最终落到同一套后端校验（人名/地名 30、号码 `^[0-9+\-]{5,20}$`、区划码 `^\d{6}$`、详址 120），
 * 所以这些片段只在这里写一次；各端按自己那侧的必填差异拼 object schema
 * （收货人 vs 联系人、买家区级必填而商家区级可空）。
 *
 * 那两个长度数字后端有一份同名 owner（`common/AddressFieldRules`：收货地址与商家地址两个 DTO 共用），
 * 三边（这里 / Java / 迁移列宽）是否还相等由 `FieldRuleVocabularyTest` 逐条核对。原先这里只留了一句
 * 散文「@Size(max=30)」当作对齐依据——散文不会报错，改了一边另一边没人知道，所以换成门禁。
 *
 * 省/市/区是三个**派生列**，不是用户输入：用户选的是一个 6 位区划码，名字在提交时按区划库反查
 * （regionNamesByCode）。表单里再存三份名字，等于让同一事实有两个来源——展示走反查、落库走手填，
 * 两者一旦不一致就没人说得清哪个算数。
 */

import { z } from "zod"

import { VALIDATION_RULES } from "../contract/validation-rules"
import { withMaxLength, type FieldRuleIssue } from "./length-rules"
import { findPath } from "./regions"

/** 人名/地名上限（后端 `AddressFieldRules.NAME_MAX`）：收货人、联系人共用 */
export const ADDRESS_NAME_MAX = 30

/** 详细地址上限（后端 `AddressFieldRules.DETAIL_MAX`） */
export const ADDRESS_DETAIL_MAX = 120

/**
 * 联系电话形状：与后端 `common/PhoneNumber.CONTACT_PATTERN` **逐字节**同串。
 *
 * 写成字符串而不是正则字面量，是为了让门禁能按字符串比：此前这里是 `/^[0-9+-]{5,20}$/`，
 * 与 Java 的 `^[0-9+\-]{5,20}$` 差一个反斜杠——语义相同、文本不同，任何逐字节核对都会红，
 * 于是这道闸门只能退化成「人看一眼，差不多」。形状本身没改（改它即改契约那一格）。
 */
export const CONTACT_PHONE_PATTERN = "^[0-9+\\-]{5,20}$"

/** 联系电话位数：输入框的 `maxLength` 拿不到正则，只能另起一个名字，而它由门禁核对等于上面那条的 `{5,20}` 上界 */
export const CONTACT_PHONE_MAX = 20

/** 智能粘贴那一框的上限（后端 `AddressFieldRules.PARSE_TEXT_MAX`）：整段文本，解析完即弃，不落库 */
export const ADDRESS_PARSE_TEXT_MAX = 500

/**
 * 邮编位数（后端 `MerchantAddressRequest.postalCode`）。
 *
 * 与区划码同样是 6 位，但**刻意不共用常量**：邮编不参与区划存在性判定，放宽其一不该连带改掉另一格。
 */
export const POSTAL_CODE_MAX = 6

/** 面单寄件人公司名上限（契约 `MerchantAddressRequest.companyName`）：印在电子面单上，超了会被承运商截断 */
export const COMPANY_NAME_MAX = 60

/**
 * 地址上的号码：不卡大陆手机号格式——收件地址里填带区号的固话是常态，地址不是登录账号。
 * 句子给 `validation.PATTERN`（「格式不对」）：号码那一格的标签就在它头上，与 422 那条通道
 * 对同一个 `@Pattern` 出的是同一句话，不在本域再抄一份「手机号格式不正确」。
 */
export const AddressPhoneSchema = z
    .string()
    .regex(new RegExp(CONTACT_PHONE_PATTERN), { message: VALIDATION_RULES.PATTERN })

/** 地址标签上限（字），对齐后端 `AddressFieldRules.LABEL_MAX`：内置码（HOME/WORK）或自填短文案 */
export const ADDRESS_LABEL_MAX = 20

/**
 * 6 位国标区划码（直筒子市是区划库合成的 `市码+00`，见 regions.loadChildren）。
 *
 * 形状住在这里，**句子由调用方给**：这条违规的 actionable 说法是「请选择所在地区」——用户该去点选择器，
 * 而通用的「这一项必填 / 格式不对」都不说这件事（`address.test.ts` 钉过这个取舍）。句子既然归各端
 * catalog（§4.1：common 不承载文案，也不该替各端点一个它没有的 key），schema 就做成工厂：
 * 两端各写一次 `regionCodeSchema(err("…"))`，规则仍然只有一份。
 */
export const REGION_CODE_PATTERN = /^\d{6}$/

export function regionCodeSchema(issue: FieldRuleIssue) {
    return z.string().regex(REGION_CODE_PATTERN, issue)
}

/** 详细地址：非空，且不重复省市区（占位文案里就写着「不需要重复输入省/市/区」） */
export const AddressDetailSchema = withMaxLength(
    z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
    ADDRESS_DETAIL_MAX,
)

/** 区划三级名（落库的冗余列） */
export interface RegionNames {
    province: string
    city: string
    district: string
}

/**
 * 三级名折成一行展示（缺席的级不占位）。
 *
 * 与 {@link regionNamesByCode} 是一对：一个把码展开成三级，一个把三级读回一行。
 * 曾经买家端地址表、卖家端地址表各写一遍 `filter(Boolean).join(" ")`，两份只在一处带详址。
 */
export function foldRegion(names: RegionNames): string {
    return [names.province, names.city, names.district].filter(Boolean).join(" ")
}

/**
 * 6 位区划码 → 省/市/区展示名，与级联选择器显示的是同一条路径（同一个 findPath）。
 *
 * 反查不到三级时缺的那级为空串，调用方拿它当「这码不认」判据即可：能进地址表单的 code 只有两个
 * 来源——选择器的叶子（恒三级）与智能粘贴（回填前先过本函数），所以提交时不会再落进空串分支。
 */
export async function regionNamesByCode(code: string): Promise<RegionNames> {
    const path = await findPath(code)
    return {
        province: path[0]?.label ?? "",
        city: path[1]?.label ?? "",
        district: path[2]?.label ?? "",
    }
}
