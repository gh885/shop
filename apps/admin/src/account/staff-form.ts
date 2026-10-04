import { CreateStaffRequestSchema } from "@shop/api/schemas"
import { StaffRole } from "@shop/api/sdk"
import { PASSWORD_MIN } from "@shop/app-kit/auth"
import { withMaxLength, withMinLength } from "@shop/common/domain"
import { z } from "zod"

import { messageFactFactory } from "@shop/common/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

import { STAFF_ROLE_LABELS } from "./constants"

/**
 * 创建员工的表单校验（前端预检；后端是权威，同口径在后端 `PasswordPolicy` 与建券那类条款里）。
 *
 * 数字来自 @shop/api/schemas 的生成约束；工号、姓名与口令上限取 CreateStaffRequest，
 * 口令下限继续复用 app-kit 的 PASSWORD_MIN，不再手写第二份数字。
 *
 * 岗位这一格在本文件收全：`StaffRoleSchema` 管提交方向（表单里必须是词表里的三个之一），
 * {@link staffRoleOf} / {@link staffRoleLabel} 管读侧（出参是宽松的 `string | null`，脏值不许裸断言）。
 * 两处都只认同一份契约词表，不再另起一个 `role.ts`——一个概念两个出口是这里最容易被抄散的地方。
 */

/** 工号上限（字）：镜像后端 `AccountFieldRules.EMPLOYEE_NO_MAX` / 契约 `CreateStaffRequest.employeeNo.maxLength` */
export const EMPLOYEE_NO_MAX = CreateStaffRequestSchema.properties.employeeNo.maxLength

/** 姓名上限（字）：镜像后端 `AccountFieldRules.DISPLAY_NAME_MAX` */
export const DISPLAY_NAME_MAX = CreateStaffRequestSchema.properties.displayName.maxLength

/**
 * 口令档位：镜像后端 `AccountFieldRules.PASSWORD_MAX`（上限 72 字符，字节上限在后端再挡一道）。
 * 下限引用 `@shop/app-kit` 的 `PASSWORD_MIN`——同一个 Java owner，本地再抄一份就是
 * shared-vocabulary 门禁要挡的「复制粘贴会静默换语义」。
 */
const PASSWORD_MAX = CreateStaffRequestSchema.properties.password.maxLength

/** 岗位词表取契约（后端 `StaffRole` 序列化出的三个值），前端不自己抄一份 */
export const StaffRoleSchema = z.enum(StaffRole)

/**
 * 校验消息只抛结构化事实（`message` = catalog key、`params` = 槽位数据），句子在渲染边界按当前语言换，
 * 判据见 `docs/conventions/i18n.md` §6.1。长度上下限那两格走 `withMaxLength` / `withMinLength`，
 * 复用 app-kit 的 `validation.{MIN,MAX}_LENGTH`——与 422 那条通道同一句话，不在本域再抄一份「最多 N 字」。
 */
type StaffErrKey = Extract<AdminMessageKey, `admin.account.form.err.${string}`>
// 参数位跟着每条消息自己的槽位走：带参的少传、参数名写错、无参的多传，三种都编译不过（§6.1）
const err = messageFactFactory<StaffErrKey, AdminParamsByKey>()

export const CreateStaffSchema = z.object({
    employeeNo: withMaxLength(
        z
            .string()
            .trim()
            .min(1, err("admin.account.form.err.employeeNoRequired"))
            .regex(/^[A-Za-z0-9-]+$/, err("admin.account.form.err.employeeNoPattern")),
        EMPLOYEE_NO_MAX,
    ),
    password: withMaxLength(withMinLength(z.string(), PASSWORD_MIN), PASSWORD_MAX),
    displayName: withMaxLength(z.string().trim(), DISPLAY_NAME_MAX),
    role: StaffRoleSchema,
})

export type CreateStaffValue = z.infer<typeof CreateStaffSchema>

/** 库里/出参里的岗位名 → 契约词表里的岗位；null 或未知值一律当「没有岗位」 */
export function staffRoleOf(value: string | null | undefined): StaffRole | undefined {
    // in 判定已经把「是不是这三个之一」收窄了；TS 不会从 `in` 推出联合类型，故此处显式收一次
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 收窄依据是上面的 `in StaffRole` 判定
    return value && value in StaffRole ? (value as StaffRole) : undefined
}

/**
 * 岗位的展示文案（列表与调岗确认句共用一份）：未知档位退回原值而不是留白——
 * 后端对库里的陌生档位照实给值（不让整页 500），前端查不到词表时把码显示出来才看得见「有一条我们没归类的新岗位」。
 */
export function staffRoleLabel(value: string | null | undefined): string {
    if (!value) return "—"
    return STAFF_ROLE_LABELS[value] ?? value
}
