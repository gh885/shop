import { describe, expect, it } from "vite-plus/test"

import { StaffRole } from "@shop/api/sdk"

import { CreateStaffSchema, staffRoleLabel, staffRoleOf } from "./staff-form"

/**
 * 岗位这一格的读侧收口：出参 `role` 是宽松的 `string | null`（后端对库里的陌生档位照实给值，
 * 不让整页 500），所以「是不是词表里的岗位」必须只有一份判定——认错了会让「无岗位」的人
 * 出现在调岗对话框里，或让列表显示出一个没人认识的英文码。
 */

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

describe("staffRoleLabel", () => {
    it("认识的岗位给中文文案，列表与调岗确认句同一份", () => {
        expect(staffRoleLabel("OPS")).toBe("运营")
        expect(staffRoleLabel(staffRoleOf("REVIEWER"))).toBe("审核员")
    })

    it("没有岗位给破折号：空串与 null 都不该留出一格看起来像渲染坏了的空白", () => {
        expect(staffRoleLabel(null)).toBe("—")
        expect(staffRoleLabel(undefined)).toBe("—")
        expect(staffRoleLabel("")).toBe("—")
    })

    it("陌生档位原样显示码本身：查不到文案时把信号留在界面上，而不是替后端猜一个", () => {
        expect(staffRoleLabel("FINANCE")).toBe("FINANCE")
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
