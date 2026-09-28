import { useEffect } from "react"

import { scrollToElement } from "@shop/common"

import type { ForbiddenHit } from "../../forbidden-word"

import type { BasicForm } from "./form-instance"

/**
 * 服务端违禁词命中（COM-01）→ 标到命中的那个字段上。
 *
 * 写进 `errorMap.onSubmit` 而不是自建一套「哪个字段红了」的状态：TextField 的失效样式与
 * `FieldError` 的文案都只读 `field.state.meta`（见 packages/ui-web 的 form.tsx），meta 是
 * 唯一入口，绕开它就得在皮肤上再开一个「外部错误」插槽。
 *
 * 选 `onSubmit` 这个槽位，是为了让红标自己会退场，不必加 mark/clear 记账：
 *  1. 用户改这个字段 → `field.setValue` 触发 `validate("change")`，库里那条「非 submit 原因
 *     校验且本地没报错就清掉 onSubmit 槽」的规则把陈旧提示撤下；
 *  2. 再次提交 → 全字段重跑 onSubmit 校验，槽位先被本地结果覆盖，本 effect 再用服务端这一轮的
 *     裁决重写（调用方在每次提交前把 hit 清空，见 routes 的 onSubmit）。
 */
export function useForbiddenWordMark({ form, hit }: { form: BasicForm; hit?: ForbiddenHit }) {
    useEffect(() => {
        if (!hit) return
        form.setFieldMeta(hit.field, (prev) => ({
            ...prev,
            errorMap: { ...prev.errorMap, onSubmit: hit.message },
        }))
        // 提交按钮钉在视口底部、出错的字段在页面顶部：不滚过去，卖家只看到「点了没反应」。
        // 滚到区块（带 scroll-mt 让位吸顶页签）而不是滚到输入框：字段的 id 由 useId 在皮肤里生成，外面拿不到。
        scrollToElement("section-basic")
    }, [form, hit])
}
