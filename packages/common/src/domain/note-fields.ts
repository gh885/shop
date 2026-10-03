/**
 * note-fields —— 「人手写的一段说明」的字数口径，跨端共用一份。后端 owner 是
 * `common/NoteFieldRules.FREE_TEXT_MAX`：买家留言、取消原因、售后补充说明、卖家拒绝理由、
 * 商家地址备注、客服结单备注、运营补录的轨迹节点描述七个入参共用同一个数。
 *
 * 镜像的是**同一个概念**，不是「同样长度的框」——按数字合并是禁区：契约里 `refreshToken` 也是 200，
 * 那是令牌的容量，与字数预算无关，并进来就等于把「换签名算法」和「放宽留言」绑成一次改动。
 *
 * 等值关系由 `FieldRuleVocabularyTest` 的 app 镜像表核对（方向与 Java 侧一致：app 自设的上限
 * 只许等于或严于契约）；四处入口散写的 `maxLength={200}` 谁也不会红，所以口径必须收在这里。
 */

/** 一段说明的上限（字），对齐后端 `NoteFieldRules.FREE_TEXT_MAX` */
export const NOTE_MAX = 200
