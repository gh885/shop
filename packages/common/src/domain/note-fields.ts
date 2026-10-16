import { CancelOrderRequestSchema } from "@shop/api/schemas"
/**
 * note-fields —— 「人手写的一段说明」的字数口径，跨端共用一份。后端 owner 是 `common/NoteFieldRules.FREE_TEXT_MAX`：买家留言、取消原因、售后补充、卖家拒绝理由、地址备注、客服结单、运营补录轨迹描述七个入参共用同一个数。镜像的是**同一个概念**不是「同样长度的框」——契约里 `refreshToken` 也是 200 但那是令牌容量，并进来就等于把「换签名算法」和「放宽留言」绑成一次改动。上限直接取生成的 CancelOrderRequest 契约，各入口更严的限制仍由 FieldRuleVocabularyTest 检查。
 */

/** 一段说明的上限（字），对齐后端 `NoteFieldRules.FREE_TEXT_MAX` */
export const NOTE_MAX = CancelOrderRequestSchema.properties.reason.maxLength
