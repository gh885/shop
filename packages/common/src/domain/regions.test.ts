import { describe, expect, it } from "vite-plus/test"

import { findPath, loadRegionCascaderTree, type RegionCascaderNode } from "./regions"

/**
 * 行政区划树测试：走真实 regions.json 数据（国标码）。
 * 关键规则：regionCode 恒为 6 位——直筒子市（东莞等）没有 6 位区级子节点，
 * 需要合成 cityCode+"00" 的区级叶子；反查失败返回空路径而不是抛错。
 */
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

/**
 * 整树适配器：级联选择器一次拿全嵌套形状，归一规则须与反查路径（findPath）一致，
 * 否则同一个地址在两个入口解析出不同 regionCode。
 * 关键：直筒子市（东莞）在树里是 6 位合成叶子。
 */
describe("loadRegionCascaderTree", () => {
    /** 深度优先找出某个 value 的节点 */
    function findNode(nodes: RegionCascaderNode[], value: string): RegionCascaderNode | undefined {
        for (const node of nodes) {
            if (node.value === value) return node
            if (node.children) {
                const found = findNode(node.children, value)
                if (found) return found
            }
        }
        return undefined
    }

    /** 一棵子树里的全部叶子 value */
    function leafValues(node: RegionCascaderNode): string[] {
        if (!node.children?.length) return [node.value]
        return node.children.flatMap(leafValues)
    }

    it("根层是省（2 位码），每层 children 嵌套完整", async () => {
        const tree = await loadRegionCascaderTree()

        expect(tree.length).toBeGreaterThan(20)
        const guangdong = findNode(tree, "44")
        expect(guangdong?.label).toBe("广东省")
        // 省 → 市 → 区三层都在
        expect(findNode(tree, "4403")?.label).toBe("深圳市")
        expect(findNode(tree, "440305")?.label).toBe("南山区")
        // 区是叶子
        expect(findNode(tree, "440305")?.children).toBeUndefined()
    })

    it("直筒子市（东莞）在树里合成 cityCode+00 的 6 位叶子", async () => {
        const tree = await loadRegionCascaderTree()
        const dongguan = findNode(tree, "4419")

        expect(dongguan?.children).toEqual([{ value: "441900", label: "东莞市" }])
        // 合成的叶子仍是 6 位，regionCode 契约成立
        expect(leafValues(dongguan!)).toEqual(["441900"])
    })

    it("直辖市（上海）走正常 市辖区→区 两级，无合成", async () => {
        const tree = await loadRegionCascaderTree()
        expect(findNode(tree, "31")?.label).toBe("上海市")
        expect(findNode(tree, "3101")?.label).toBe("市辖区")
        expect(findNode(tree, "310101")?.label).toBe("黄浦区")
        expect(findNode(tree, "310101")?.children).toBeUndefined()
    })

    it("全树 regionCode（叶子）都是 6 位，直筒子市也不例外", async () => {
        const tree = await loadRegionCascaderTree()
        const allLeaves = tree.flatMap(leafValues)

        expect(allLeaves.every((code) => code.length === 6)).toBe(true)
        // 4 个直筒子市的合成码都在
        expect(allLeaves).toEqual(expect.arrayContaining(["441900", "442000", "460400", "620200"]))
    })
})
