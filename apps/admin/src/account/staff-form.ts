import { StaffRole } from "@shop/api/sdk"
import { PASSWORD_MIN } from "@shop/app-kit"
import { z } from "zod"

/**
 * 创建员工的表单校验（前端预检；后端是权威，同口径在后端 `PasswordPolicy` 与建券那类条款里）。
 *
 * 数字都引用 owner：工号长度走 `@shop/api` 契约的 maxLength 镜像（见 {@link EMPLOYEE_NO_MAX}），
 * 口令长度走后端 `AccountFieldRules.PASSWORD_MIN/MAX` 的镜像常量，两边由门禁核对。
 */

/** 工号上限（字）：镜像后端 `AccountFieldRules.EMPLOYEE_NO_MAX` / 契约 `CreateStaffRequest.employeeNo.maxLength` */
export const EMPLOYEE_NO_MAX = 50

/** 姓名上限（字）：镜像后端 `AccountFieldRules.DISPLAY_NAME_MAX` */
export const DISPLAY_NAME_MAX = 50

/**
 * 口令档位：镜像后端 `AccountFieldRules.PASSWORD_MIN/MAX`（8~72 字符，字节上限在后端再挡一道）。
 *
 * 下限直接引用 `@shop/app-kit` 的 `PASSWORD_MIN`——同一个 Java owner（`AccountFieldRules.PASSWORD_MIN`），
 * 本地再抄一份就是 shared-vocabulary 门禁要挡的「复制粘贴会静默换语义」。
 */
export const PASSWORD_MAX = 72

/** 岗位词表取契约（后端 `StaffRole` 序列化出的三个值），前端不自己抄一份 */
export const StaffRoleSchema = z.enum(StaffRole)

export const CreateStaffSchema = z.object({
    employeeNo: z
        .string()
        .trim()
        .min(1, "请填写工号")
        .max(EMPLOYEE_NO_MAX, `工号最多 ${EMPLOYEE_NO_MAX} 字`)
        .regex(/^[A-Za-z0-9-]+$/, "工号只能包含字母、数字与短横"),
    password: z
        .string()
        .min(PASSWORD_MIN, `密码至少 ${PASSWORD_MIN} 位`)
        .max(PASSWORD_MAX, `密码最多 ${PASSWORD_MAX} 位`),
    displayName: z.string().trim().max(DISPLAY_NAME_MAX, `姓名最多 ${DISPLAY_NAME_MAX} 字`),
    role: StaffRoleSchema,
})

export type CreateStaffValue = z.infer<typeof CreateStaffSchema>
