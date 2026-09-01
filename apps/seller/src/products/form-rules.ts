import { z } from "zod"

/**
 * 商品发布表单的字段级校验规则。
 * 与后端 @Pattern/@Size 契约对齐，放在表单就近处（PublishBasicStep 使用）。
 */

/** 商品标题（搜索标题）：参与搜索召回的关键词位，上限 30 字 */
export const ProductNameSchema = z
    .string()
    .trim()
    .min(1, "请输入商品标题")
    .max(30, "商品标题最长 30 字")

/** 一句话卖点：可不填；填了就得写够一句（10~30 字），与后端 @Pattern 校验对齐 */
export const SellingPointSchema = z
    .string()
    .trim()
    .refine(
        (v) => v.length === 0 || (v.length >= 10 && v.length <= 30),
        "卖点填了就写 10~30 字，不想写可以留空",
    )
