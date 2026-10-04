import { CancelOrderRequestSchema } from "@shop/api/schemas"
/**
 * note-fields —— 「人手写的一段说明」的字数口径，跨端共用一份。后端 owner 是
 * `common/NoteFieldRules.FREE_TEXT_MAX`：买家留言、取消原因、售后补充说明、卖家拒绝理由、
 * 商家地址备注、客服结单备注、运营补录的轨迹节点描述七个入参共用同一个数。
 *
 * 镜像的是**同一个概念**，不是「同样长度的框」——按数字合并是禁区：契约里 `refreshToken` 也是 200，
 * 那是令牌的容量，与字数预算无关，并进来就等于把「换签名算法」和「放宽留言」绑成一次改动。
 *
 * 上限直接取生成的 CancelOrderRequest 契约，前端只保留这一个语义出口。
 * 各入口刻意更严格的限制仍由 FieldRuleVocabularyTest 检查，不混入这个通用上限。
 */

/** 一段说明的上限（字），对齐后端 `NoteFieldRules.FREE_TEXT_MAX` */
export const NOTE_MAX = CancelOrderRequestSchema.properties.reason.maxLength
