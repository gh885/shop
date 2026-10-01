/**
 * product-fields —— 商品标题、卖点与规格取值的字段口径，卖家端各处表单共用一份。
 *
 * 后端权威是 `product/dto/ProductFieldRules`（创建与编辑两个 DTO 共用），它的数字与提示语经 springdoc
 * 进 OpenAPI 契约；这里镜像的是**同一套规则**，不是「差不多长的输入框」。三边（这里 / Java / 契约那一格）
 * 是否还相等由 `apps/server` 的 `FieldRuleVocabularyTest` 读本文件的数字与文案来核对——它比的是值，
 * 不是注释：此前两处表单各自写着 `maxLength={30}` 和三个局部常量，报错文案一份叫「商品标题最长 30 字」、
 * 一份叫「导购标题需为 10~30 个字，或留空」，卖家按入口不同拿到两种提示，而这两处对任何门禁都不可见。
 *
 * 提示语本身是规则的一部分：后端把上限拼进了 message（`"商品标题最长 " + NAME_MAX + " 字"`），
 * 所以这里的文案必须逐字节相同——门禁就是按逐字节比对的，抄成「请填写商品标题最长 30 字」会红。
 *
 * 字段**标签**不在这里统一：发布页叫「商品卖点」、改标题弹窗叫「导购标题」，那是入口文案而不是规则。
 */

import { z } from "zod"

/** 商品标题上限（后端 `ProductFieldRules.NAME_MAX`）：搜索召回的关键词位，写长了卡片也放不下 */
export const PRODUCT_NAME_MAX = 30

/** 标题超限提示（后端 `ProductFieldRules.NAME_MESSAGE` 的求值结果） */
export const PRODUCT_NAME_MESSAGE = `商品标题最长 ${PRODUCT_NAME_MAX} 字`

/** 卖点下限：填了就得写够一句，半截话不如不填 */
export const SELL_POINT_MIN = 10

/** 卖点上限（后端 `ProductFieldRules.SELL_POINT_PATTERN` 的 `{10,30}` 上界） */
export const SELL_POINT_MAX = 30

/** 卖点提示（后端 `ProductFieldRules.SELL_POINT_MESSAGE`，逐字节） */
export const SELL_POINT_MESSAGE = "卖点填了就写 10~30 字，不想写可以留空"

/** 商品标题：必填 + 上限。草稿期后端允许空名，必填这一条是表单侧的发布前置检查 */
export const ProductNameSchema = z
    .string()
    .trim()
    .min(1, "请填写商品标题")
    .max(PRODUCT_NAME_MAX, PRODUCT_NAME_MESSAGE)

/**
 * 一句话卖点：留空即「不展示卖点」，填了就得 10~30 字。
 *
 * 空串放行是刻意的，与后端用 `@Pattern("^$|^[\\s\\S]{10,30}$")` 而不是 `@Size(min)` 同一个理由：
 * PATCH 语义下「清空已填内容」要传空串，`Size(min)` 会把清空一起判死。
 */
export const SellPointSchema = z
    .string()
    .trim()
    .refine(
        (v) => v.length === 0 || (v.length >= SELL_POINT_MIN && v.length <= SELL_POINT_MAX),
        SELL_POINT_MESSAGE,
    )

/**
 * 一个规格维度的取值数上限（后端 `ProductFieldRules.SPEC_VALUES_MAX`）：值域内勾选与自填共用这一档。
 *
 * 它是编辑器的「＋」该在几个取值时停手的依据，不只是提交后才晓得的报错：取值数决定 SKU 矩阵的宽度，
 * 后端还按维度的乘卡总量另设一道校验，所以让卖家一个维度刷出 21 个取值再吃 400，等于把闸门推给报错。
 */
export const SPEC_VALUES_MAX = 20

/**
 * 规格取值文本上限（字，后端 `CategoryFieldRules.ATTR_VALUE_MAX`）：自定义取值以此文本建档进
 * `product.category_attr_values.value` 那一列。
 *
 * 输入框卡长度而不是提交后红字：取值会进 SKU 名（`product.skus.name` 160 = 标题 + 各维度取值拼接），
 * 单个取值写长了不是它自己那一格的事，会把整行的组合名一起挤掉。
 */
export const SPEC_VALUE_MAX = 64
