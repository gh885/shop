/**
 * tracking —— 运单字段口径，卖家发货与买家回寄两份表单共用一份。
 *
 * 上限直接取生成的 ReturnGoodsRequest 契约，不在前端抄数字。
 * 后端 TrackingFieldRules、DTO 注解、契约与迁移列宽仍由 FieldRuleVocabularyTest 核对；
 * 两端表单只引用这里的语义出口。
 *
 * 承运商 **code** 不在这里镜像：它不是用户输入，两端都从字典里选（`carriers.code` 32 只由后端那侧管），
 * 前端抄一份就是个没人读的常量——共享出口的规则是「有真实调用点才算 owner」，不是「看着对称」。
 *
 * 运单号一律先 `trim()`：承运商推送按号精确匹配，尾随一个空格就永远查不到轨迹。
 */

import { ReturnGoodsRequestSchema } from "@shop/api/schemas"
import { z } from "zod"

import { VALIDATION_RULES } from "../contract/validation-rules"
import { withMaxLength } from "./length-rules"

/** 承运商展示名上限：买家回寄时是手输原文，对不上字典也照实记 */
export const CARRIER_NAME_MAX = ReturnGoodsRequestSchema.properties.logisticsCompany.maxLength

/** 运单号上限：库上三处同为 64（shipments / orders 发货快照 / 售后回寄投影） */
export const TRACKING_NO_MAX = ReturnGoodsRequestSchema.properties.trackingNo.maxLength

/**
 * 运单号字段：两处表单此前逐字节相同（同一句提示语、同一个上限），收成一份。
 * 句子走 `validation.{REQUIRED,MAX_LENGTH}`——卖家发货与买家回寄两个入口对同一条 @Size/@NotBlank
 * 只能有一句话，而 422 那条通道出的就是这两句（`field-error-fact.ts` 按 rule 出事实）。
 */
export const TrackingNoSchema = withMaxLength(
    z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
    TRACKING_NO_MAX,
)
