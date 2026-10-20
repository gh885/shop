import {
    SUBACCOUNT_PERMISSION_LABEL,
    type SubaccountPermission,
    type SubaccountPermissionKey,
} from "./constants"

/** 本域业务规则唯一出口（rules 槽位）：判定与不依赖语言的推导。展示词表（权限/状态表、上限镜像）在 constants.ts，表单契约在 subaccount-form.ts / shop-form.ts，出文案在调用点 t(labelKey) */

// 认不出的码返回 undefined、调用方退回显示码本身：不吞，静默丢一格权限等于谎报这人能干什么
export function subaccountPermissionLabel(code: string): SubaccountPermissionKey | undefined {
    return Object.hasOwn(SUBACCOUNT_PERMISSION_LABEL, code)
        ? SUBACCOUNT_PERMISSION_LABEL[code as SubaccountPermission]
        : undefined
}
