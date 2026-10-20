import { describe, expect, it } from "vite-plus/test"

import { StaffRole } from "@shop/api/sdk"

import type { StaffRoleKey } from "./constants"
import { CreateStaffSchema, staffRoleLabel, staffRoleOf } from "./staff-form"

describe("staffRoleOf", () => {
    it("词表里的三个岗位各自认下来", () => {
        expect(staffRoleOf("SUPER_ADMIN")).toBe(StaffRole.SUPER_ADMIN)
        expect(staffRoleOf("REVIEWER")).toBe(StaffRole.REVIEWER)
        expect(staffRoleOf("OPS")).toBe(StaffRole.OPS)
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

const t = (key: StaffRoleKey) => key

describe("staffRoleLabel", () => {
    it("认识的岗位回 catalog key，列表与调岗确认句同一份", () => {
        expect(staffRoleLabel("OPS", t)).toBe("account.role.OPS")
        expect(staffRoleLabel(staffRoleOf("REVIEWER"), t)).toBe("account.role.REVIEWER")
    })

    it("没有岗位给破折号：空串与 null 都不该留出一格看起来像渲染坏了的空白", () => {
        expect(staffRoleLabel(null, t)).toBe("—")
        expect(staffRoleLabel(undefined, t)).toBe("—")
        expect(staffRoleLabel("", t)).toBe("—")
    })

    it("陌生档位原样显示码本身：查不到文案时把信号留在界面上，而不是替后端猜一个", () => {
        expect(staffRoleLabel("FINANCE", t)).toBe("FINANCE")
    })
})

describe("CreateStaffSchema", () => {
    it("建员工时岗位必填且只认词表：默认值 OPS 是「漏填就建出一个运营」的口子", () => {
        const base = { employeeNo: "A-001", password: "abcd1234", displayName: "" }

        expect(CreateStaffSchema.safeParse({ ...base, role: "OPS" }).success).toBe(true)
        expect(CreateStaffSchema.safeParse({ ...base, role: "" }).success).toBe(false)
        expect(CreateStaffSchema.safeParse({ ...base }).success).toBe(false)
    })

    it("工号只认字母数字与短横，姓名可留空（后端把空串折成缺省）", () => {
        expect(
            CreateStaffSchema.safeParse({
                employeeNo: "A 001",
                password: "abcd1234",
                displayName: "",
                role: "OPS",
            }).success,
        ).toBe(false)
        expect(
            CreateStaffSchema.safeParse({
                employeeNo: "A-001",
                password: "abcd1234",
                displayName: "",
                role: "OPS",
            }).success,
        ).toBe(true)
    })
})
