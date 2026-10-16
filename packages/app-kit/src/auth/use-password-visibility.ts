import { useCallback, useState } from "react"

import { useT } from "../i18n"

/**
 * 密码可见性（小眼睛）的状态与文案，全项目一处出口：只返回零散值（明文与否 + 切换动作 + 可访问名）而不是包办装配的组件——
 * 输入框长相归各皮肤 CSS、位置走 TextField 的 trailing、按钮用 PasswordToggle，装配权留给调用点才接得住不同皮肤。
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
            label: visible ? t("form.hidePassword") : t("form.showPassword"),
        },
    }
}
