import { useCallback, useState } from "react"

import { useT } from "./i18n"

/**
 * 密码可见性（小眼睛）的状态与文案，全项目一处出口。
 *
 * 只有「当前明文与否 + 切换动作 + 可访问名」是通用的；输入框长什么样归各皮肤的 CSS，
 * 位置交给 `@shop/ui-web` `TextField` 的 `trailing` 插槽（下划线登录框与描边盒表单都走它），
 * 按钮见 `PasswordToggle`。所以这里返回的是几段零散的值而不是一个包办装配的组件——
 * 装配权留给调用点，才接得住不同皮肤。
 *
 * 典型用法：
 * ```tsx
 * const pw = usePasswordVisibility()
 * <field.TextField type={pw.inputType} trailing={<PasswordToggle {...pw.toggleProps} />} />
 * ```
 */
export function usePasswordVisibility() {
    const t = useT()
    const [visible, setVisible] = useState(false)
    const onToggle = useCallback(() => setVisible((v) => !v), [])

    return {
        visible,
        /** 直接喂给 `<input type>`：明文时是 text，遮蔽时是 password */
        inputType: visible ? ("text" as const) : ("password" as const),
        /** 展开给 `PasswordToggle`；`label` 随状态切换，调用点不必再判语言 */
        toggleProps: {
            visible,
            onToggle,
            label: visible ? t("appKit.form.hidePassword") : t("appKit.form.showPassword"),
        },
    }
}
