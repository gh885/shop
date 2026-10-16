import { useEffect } from "react"

import { scrollToElement } from "@shop/common/domain"
import type { ForbiddenHit } from "../../forbidden-word"

import type { BasicForm } from "./form-instance"

// 命中写进 errorMap.onSubmit 而非自建「哪个字段红了」的状态：TextField/FieldError 只读 field.state.meta，meta 是唯一入口；选 onSubmit 槽是让红标随库的「change 校验清 onSubmit 槽」规则自行退场，不用 mark/clear 记账
export function useForbiddenWordMark({ form, hit }: { form: BasicForm; hit?: ForbiddenHit }) {
    useEffect(() => {
        if (!hit) return
        form.setFieldMeta(hit.field, (prev) => ({
            ...prev,
            errorMap: { ...prev.errorMap, onSubmit: hit.message },
        }))
        // 提交按钮钉在视口底部、出错字段在页面顶部：不滚过去卖家只看到「点了没反应」；滚到区块（id 由 useId 生成，外面拿不到字段 id）
        scrollToElement("section-basic")
    }, [form, hit])
}
