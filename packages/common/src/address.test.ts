import { describe, expect, it } from "vitest"

import { loadChildren } from "./regions"

import {
    AddressDetailSchema,
    AddressPhoneSchema,
    AddressRegionCodeSchema,
    regionNamesByCode,
} from "./address"

/**
 * 地址字段口径测试：走真实 regions.json（国标码）。
 * 这里钉的是「提交时派生省市区名」这套做法的地基——凡选择器给的叶子码，反查必须出三级非空名。
 */

describe("字段口径", () => {
    it("号码：地址上的固话带区号也算数，太短的一串数字不算", () => {
        expect(AddressPhoneSchema.safeParse("13800000000").success).toBe(true)
        expect(AddressPhoneSchema.safeParse("021-88888888").success).toBe(true)
        expect(AddressPhoneSchema.safeParse("1234").success).toBe(false)
    })

    it("区划码：只认 6 位，市级的 4 位码不配进表单", () => {
        expect(AddressRegionCodeSchema.safeParse("440305").success).toBe(true)
        expect(AddressRegionCodeSchema.safeParse("4419").success).toBe(false)
        expect(AddressRegionCodeSchema.safeParse("").success).toBe(false)
    })

    it("区划码不合法时报的是「请选择所在地区」，不是「格式不正确」：用户看到的是该去点选择器", () => {
        const issue = AddressRegionCodeSchema.safeParse("4419").error?.issues[0]
        expect(issue?.message).toBe("请选择所在地区")
    })

    it("详址两端去空格后判长，最长 120 字", () => {
        expect(AddressDetailSchema.safeParse("  ").success).toBe(false)
        expect(AddressDetailSchema.safeParse("文一路 1 号").success).toBe(true)
        expect(AddressDetailSchema.safeParse("路".repeat(121)).success).toBe(false)
    })
})

describe("regionNamesByCode", () => {
    it("普通区县：名字与级联选择器显示的同一级", async () => {
        await expect(regionNamesByCode("440305")).resolves.toEqual({
            province: "广东省",
            city: "深圳市",
            district: "南山区",
        })
    })

    it("直筒子市（东莞）：区级是合成的市名本身，6 位码仍然出三级", async () => {
        await expect(regionNamesByCode("441900")).resolves.toEqual({
            province: "广东省",
            city: "东莞市",
            district: "东莞市",
        })
    })

    it("直辖市：中间那级按区划库是「市辖区」，派生不替它编一个好听的", async () => {
        await expect(regionNamesByCode("310101")).resolves.toEqual({
            province: "上海市",
            city: "市辖区",
            district: "黄浦区",
        })
    })

    it("查不出的码：district 落空串，调用方拿它当「这码不认」判据", async () => {
        await expect(regionNamesByCode("999999")).resolves.toEqual({
            province: "",
            city: "",
            district: "",
        })
    })

    it("全量叶子码逐个核对：选择器能选出来的每一个 6 位码都反查得出三级非空名", async () => {
        const provinces = await loadChildren(undefined)
        const cityGroups = await Promise.all(provinces.map(loadChildren))
        const cities = cityGroups.flat()
        const districtGroups = await Promise.all(cities.map(loadChildren))
        const leaves = districtGroups.flat()
        expect(leaves.length).toBeGreaterThan(2000)

        const checked = await Promise.all(
            leaves.map(async (leaf) => [leaf.code, await regionNamesByCode(leaf.code)] as const),
        )
        const bad = checked
            .filter(([, names]) => !names.province || !names.city || !names.district)
            .map(([code]) => code)
        expect(bad).toEqual([])
    })
})
