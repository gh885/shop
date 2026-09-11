import { describe, expect, it } from "vitest"

import { findPath, loadChildren } from "./regions"

/**
 * 行政区划树测试：走真实 regions.json 数据（国标码）。
 * 关键规则：regionCode 恒为 6 位——直筒子市（东莞等）没有 6 位区级子节点，
 * 需要合成 cityCode+"00" 的区级叶子；反查失败返回空路径而不是抛错。
 */
describe("loadChildren", () => {
    it("根层返回省列表，均非叶子", async () => {
        const roots = await loadChildren(undefined)

        expect(roots.length).toBeGreaterThan(20)
        expect(roots.find((r) => r.code === "44")).toMatchObject({ label: "广东省", isLeaf: false })
    })

    it("省 → 市按层取孩子，市下还有区所以不是叶子", async () => {
        const cities = await loadChildren({ code: "44", label: "广东省", isLeaf: false })

        expect(cities.find((c) => c.code === "4403")).toMatchObject({
            label: "深圳市",
            isLeaf: false,
        })
    })

    it("市 → 区是叶子", async () => {
        const districts = await loadChildren({ code: "4403", label: "深圳市", isLeaf: false })

        expect(districts.find((d) => d.code === "440305")).toMatchObject({
            label: "南山区",
            isLeaf: true,
        })
    })

    it("直筒子市（东莞）合成 cityCode+00 的区级叶子，保证 6 位码", async () => {
        const districts = await loadChildren({ code: "4419", label: "东莞市", isLeaf: false })

        expect(districts).toEqual([{ code: "441900", label: "东莞市", isLeaf: true }])
    })

    it("未知的父节点返回空列表，不抛错", async () => {
        await expect(
            loadChildren({ code: "999999", label: "不存在", isLeaf: false }),
        ).resolves.toEqual([])
    })
})

describe("findPath", () => {
    it("6 位码反查出 省→市→区 三级路径", async () => {
        const path = await findPath("440305")

        expect(path.map((p) => p.code)).toEqual(["44", "4403", "440305"])
        expect(path[2]).toMatchObject({ label: "南山区", isLeaf: true })
    })

    it("只有省市级码时返回到市为止的路径", async () => {
        const path = await findPath("4403")

        expect(path.map((p) => p.code)).toEqual(["44", "4403"])
    })

    it("直筒子市合成码反查出 合成叶子", async () => {
        const path = await findPath("441900")

        expect(path.map((p) => p.code)).toEqual(["44", "4419", "441900"])
        expect(path[2]?.label).toBe("东莞市")
    })

    it("未知码返回空路径（回填静默降级）", async () => {
        await expect(findPath("999999")).resolves.toEqual([])
        await expect(findPath("")).resolves.toEqual([])
    })
})
