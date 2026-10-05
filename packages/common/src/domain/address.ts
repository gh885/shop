/**
 * address —— 地址字段口径 + 「省市区名」派生，web 收货地址与 seller 商家地址共用一份。
 *
 * 两端最终落到同一套后端校验（人名/地名 30、联系电话 5~20、区划码 6 位、详址 120），
 * 所以这些片段只在这里写一次；各端按自己那侧的必填差异拼 object schema
 * （收货人 vs 联系人、买家区级必填而商家区级可空）。
 *
 * 长度与**形状**都直接引用 @shop/api/schemas；Java owner 仍是 common/AddressFieldRules，
 * 「注解 → 契约 → 本文件」是单向传递，Java 注解与列宽由 FieldRuleVocabularyTest 核对。
 *
 * 联系电话与区划码的形状此前在这里手写（还各配了一道逐字节核对的门禁），2026-10 改成读契约那一格：
 * 契约是从 `@Pattern(regexp = PhoneNumber.CONTACT_PATTERN)` 生成的，前端再抄一遍就是第二个出处，
 * 而那道「逐字节比」的门禁本身说明手抄不可靠（曾差一个反斜杠，语义相同、文本不同）。
 * 只有 CONTACT_PHONE_MAX 这个**数**还留着手写：它取的是正则里量词的上界，
 * 而 JSON Schema 的 `pattern` 是一整条字符串，没有结构化的边界可读。
 *
 * 省/市/区是三个**派生列**，不是用户输入：用户选的是一个 6 位区划码，名字在提交时按区划库反查
 * （regionNamesByCode）。表单里再存三份名字，等于让同一事实有两个来源——展示走反查、落库走手填，
 * 两者一旦不一致就没人说得清哪个算数。
 */

import {
    AddressParseRequestSchema,
    AddressRequestSchema,
    MerchantAddressRequestSchema,
} from "@shop/api/schemas"
import { z } from "zod"

import { VALIDATION_RULES } from "../contract/validation-rules"
import { withMaxLength, type FieldRuleIssue } from "./length-rules"
import { findPath } from "./regions"

/** 人名/地名上限（后端 `AddressFieldRules.NAME_MAX`）：收货人、联系人共用 */
export const ADDRESS_NAME_MAX = AddressRequestSchema.properties.receiverName.maxLength

/** 详细地址上限（后端 `AddressFieldRules.DETAIL_MAX`） */
export const ADDRESS_DETAIL_MAX = AddressRequestSchema.properties.detail.maxLength

/**
 * 联系电话形状：取契约 `AddressRequest.phone` 那一格（由后端 `@Pattern(PhoneNumber.CONTACT_PATTERN)` 生成）。
 *
 * 商家地址那格（`MerchantAddressRequest.phone`）是同一条 Java 常量，两格相等由 `FieldRuleVocabularyTest`
 * 的「号码与验证码形状各只有一份」钉住；所以从任一格读都等价，此处取买家侧那一格。
 * 前端不再手写这条形状，也就不再需要「与 Java 逐字节同串」那道核对——漂移在构造上不可能发生。
 */
export const CONTACT_PHONE_PATTERN = AddressRequestSchema.properties.phone.pattern

/** 联系电话位数：输入框的 `maxLength` 拿不到正则，只能另起一个名字，而它由门禁核对等于上面那条的 `{5,20}` 上界 */
export const CONTACT_PHONE_MAX = 20

/** 智能粘贴那一框的上限（后端 `AddressFieldRules.PARSE_TEXT_MAX`）：整段文本，解析完即弃，不落库 */
export const ADDRESS_PARSE_TEXT_MAX = AddressParseRequestSchema.properties.text.maxLength

/**
 * 邮编位数（后端 `MerchantAddressRequest.postalCode`）。
 *
 * 与区划码同样是 6 位，但**刻意不共用常量**：邮编不参与区划存在性判定，放宽其一不该连带改掉另一格。
 */
export const POSTAL_CODE_MAX = MerchantAddressRequestSchema.properties.postalCode.maxLength

/**
 * 邮编形状：取契约 `MerchantAddressRequest.postalCode` 那一格（后端 `@Pattern("^\\d{6}$")`）。
 *
 * 此前 seller 的地址表单拿 {@link POSTAL_CODE_MAX} 现拼了一条 `^\d{6}$`——同一条规则的第二个出处，
 * 而契约里本来就有这一格。形状与位数两个出口现在都指向契约：位数给输入框的 `maxLength`，
 * 形状给 `regex()`（`pattern` 是一整条字符串，`maxLength` 拿不到形状，两格都得留）。
 */
export const POSTAL_CODE_PATTERN = new RegExp(
    MerchantAddressRequestSchema.properties.postalCode.pattern,
)

/** 面单寄件人公司名上限（契约 `MerchantAddressRequest.companyName`）：印在电子面单上，超了会被承运商截断 */
export const COMPANY_NAME_MAX = MerchantAddressRequestSchema.properties.companyName.maxLength

/**
 * 地址上的号码：不卡大陆手机号格式——收件地址里填带区号的固话是常态，地址不是登录账号。
 * 句子给 `validation.PATTERN`（「格式不对」）：号码那一格的标签就在它头上，与 422 那条通道
 * 对同一个 `@Pattern` 出的是同一句话，不在本域再抄一份「手机号格式不正确」。
 */
export const AddressPhoneSchema = z
    .string()
    .regex(new RegExp(CONTACT_PHONE_PATTERN), { message: VALIDATION_RULES.PATTERN })

/** 地址标签上限（字），对齐后端 `AddressFieldRules.LABEL_MAX`：内置码（HOME/WORK）或自填短文案 */
export const ADDRESS_LABEL_MAX = AddressRequestSchema.properties.label.maxLength

/**
 * 6 位国标区划码（直筒子市是区划库合成的 `市码+00`，见 regions.loadChildren）。
 *
 * 形状取契约 `AddressRequest.regionCode` 那一格（后端 `ShopFieldRules` 的 `^\d{6}$` 经注解生成）；
 * 契约给的是字符串，这里转成 `RegExp`——`regex()` 收的正是正则对象。
 *
 * 句子由调用方给：这条违规的 actionable 说法是「请选择所在地区」——用户该去点选择器，
 * 而通用的「这一项必填 / 格式不对」都不说这件事（`address.test.ts` 钉过这个取舍）。句子既然归各端
 * catalog（§4.1：common 不承载文案，也不该替各端点一个它没有的 key），schema 就做成工厂：
 * 两端各写一次 `regionCodeSchema(err("…"))`，规则仍然只有一份。
 */
export const REGION_CODE_PATTERN = new RegExp(AddressRequestSchema.properties.regionCode.pattern)

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
