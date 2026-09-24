/**
 * tracking —— 运单字段口径，卖家发货与买家回寄两份表单共用一份。
 *
 * 这两个上限各有权威：后端词表 `TrackingFieldRules`（Java）与迁移里的列宽（`shipments.carrier_name` /
 * `orders.logistics_company` 50、运单号三处 64）。前端比后端宽 = 提交吃 400，前端比后端窄 = 用户被一个
 * 不存在的长度挡住，两种都只能靠人肉对齐发现。所以三边（这里 / Java 常量 / 迁移列宽）是否还相等，
 * 由 `apps/server` 的 `FieldRuleVocabularyTest` 直接读本文件的数字来核对——它读的是数值，不是注释：
 * 原先两边的依据都是散文书写的「与后端 @Size 对齐」，散文不会报错（同一个坑见 `address.ts` 的头注释）。
 *
 * 承运商 **code** 不在这里镜像：它不是用户输入，两端都从字典里选（`carriers.code` 32 只由后端那侧管），
 * 前端抄一份就是个没人读的常量——共享出口的规则是「有真实调用点才算 owner」，不是「看着对称」。
 *
 * 运单号一律先 `trim()`：承运商推送按号精确匹配，尾随一个空格就永远查不到轨迹。
 */

import { z } from "zod"

/** 承运商展示名上限：买家回寄时是手输原文，对不上字典也照实记 */
export const CARRIER_NAME_MAX = 50

/** 运单号上限：库上三处同为 64（shipments / orders 发货快照 / 售后回寄投影） */
export const TRACKING_NO_MAX = 64

/** 运单号字段：两处表单此前逐字节相同（同一句提示语、同一个上限），收成一份 */
export const TrackingNoSchema = z
    .string()
    .trim()
    .min(1, "请填写运单号")
    .max(TRACKING_NO_MAX, `运单号最长 ${TRACKING_NO_MAX} 字`)
