import type { ReactNode } from "react"

import { submitForm } from "@shop/app-kit/forms" /**
 * 内联小表单的外壳：一个 `<form>` + 「提交只走 submitForm 那唯一出口」那段接线。
 *
 * 只管外壳——字段、校验、页脚全由调用点给。间距（`className`）也留给调用点：同一页里
 * 新增卡与行内改名卡差一档是刻意的，但**提交出口不能各处再写一遍**：`e.preventDefault()`
 * 配上 `void form.handleSubmit()` 就是那条会漏 rejection 的写法，收进这里一处，
 * 新表单默认拿不到错的版本。
 */
export function InlineFormCard({
    className,
    form,
    children,
}: {
    className: string
    form: Parameters<typeof submitForm>[0]
    children: ReactNode
}) {
    return (
        <form
            className={className}
            onSubmit={(event) => {
                event.preventDefault()
                void submitForm(form)
            }}
        >
            {children}
        </form>
    )
}
