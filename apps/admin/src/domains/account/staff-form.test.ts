import { describe, expect, it } from "vite-plus/test"

import { STAFF_ROLES, type StaffRole } from "./constants"
import { staffRoleOf } from "./staff-form"

// STAFF_ROLES 是词表的唯一来源，这里顺带钉住「改词表要连测试一起改」
void (STAFF_ROLES satisfies readonly StaffRole[])

describe("staffRoleOf", () => {
    it("词表里的三个岗位各自认下来", () => {
        expect(staffRoleOf("SUPER_ADMIN")).toBe("SUPER_ADMIN")
        expect(staffRoleOf("REVIEWER")).toBe("REVIEWER")
        expect(staffRoleOf("OPS")).toBe("OPS")
    })

    it("null / 空串 / undefined 都是「没有岗位」：调岗按钮不给入口，列表显示破折号", () => {
        expect(staffRoleOf(null)).toBeUndefined()
        expect(staffRoleOf(undefined)).toBeUndefined()
        expect(staffRoleOf("")).toBeUndefined()
    })

    it("未知档位不当成某个岗位：宁可少一个入口，也不给一个错的权限集", () => {
        expect(staffRoleOf("support")).toBeUndefined()
        expect(staffRoleOf("ops")).toBeUndefined()
        expect(staffRoleOf("SUPER_ADMIN ")).toBeUndefined()
    })
})
