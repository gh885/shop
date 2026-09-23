import { describe, expect, it } from "vitest"

import type { CategoryNode } from "@shop/api/sdk"

import {
    columnsOf,
    filterByName,
    flattenLeafPaths,
    isLeaf,
    nodesOf,
    searchLeafPaths,
    selectAt,
    selectedLeafId,
    type LeafPath,
} from "./category"

/**
 * 类目树算法：商品只能挂末级，而级联三列 / 面包屑 / 搜索候选 / 「能否进下一步」四处
 * 都从同一棵缓存树上算。钉住的是这四处的口径一致，尤其是「选中末级就不再出下一列」
 * 与「脏路径要截断」——路径来自 URL，用户可以手改任何一段。
 */

/** id 直接用名称当值：断言读起来就是树本身的样子；其余契约字段算法不读，给合法值 */
function node(name: string, children: CategoryNode[] = []): CategoryNode {
    return {
        id: name,
        parentId: "0",
        name,
        level: 1,
        sort: 0,
        status: "ENABLED",
        iconUrl: null,
        children,
    }
}

/**
 * 数码（手机[存储卡] / 平板）｜服饰（男装）｜空目录
 *
 * 两个边界各占一处：`存储卡` 让「手机」成为非末级的中间级；`空目录` 是 children 为空
 * 的分支，它按定义就是末级。
 */
const tree: CategoryNode[] = [
    node("数码", [node("手机", [node("存储卡")]), node("平板")]),
    node("服饰", [node("男装")]),
    node("空目录"),
]

const paths = flattenLeafPaths(tree)

describe("flattenLeafPaths", () => {
    it("只吐末级路径：商品挂不到中间级，父级进候选就是给一个提交必失败的选项", () => {
        expect(paths.map((p) => p.id)).toEqual(["存储卡", "平板", "男装", "空目录"])
    })

    it("一条路径带根 → 末级的完整 ids 与 names（级联回填靠它一次铺满三列）", () => {
        const card = paths.find((p) => p.id === "存储卡")

        expect(card).toMatchObject({
            ids: ["数码", "手机", "存储卡"],
            names: ["数码", "手机", "存储卡"],
        })
    })
})

describe("searchLeafPaths", () => {
    it("空关键词返回空而不是全量：把整棵树倒进下拉框等于没有搜索", () => {
        expect(searchLeafPaths(paths, "")).toEqual([])
        expect(searchLeafPaths(paths, "   ")).toEqual([])
    })

    it("命中任一级都算候选：搜「数码」时卖家要的是这个大类下的末级", () => {
        expect(searchLeafPaths(paths, "数码").map((p) => p.id)).toEqual(["存储卡", "平板"])
    })

    it("末级名命中的排在只命中祖先名的之前：搜「手机」时末级「手机壳」压过「手机 > 存储卡」", () => {
        const corpus: LeafPath[] = [
            { id: "card", ids: ["数码", "手机"], names: ["数码", "手机", "存储卡"] },
            { id: "case", ids: ["数码", "配件"], names: ["数码", "配件", "手机壳"] },
        ]

        expect(searchLeafPaths(corpus, "手机").map((p) => p.id)).toEqual(["case", "card"])
    })

    it("大小写不敏感", () => {
        const latin = flattenLeafPaths([node("Digital", [node("Phone")])])

        expect(searchLeafPaths(latin, "PHONE").map((p) => p.id)).toEqual(["Phone"])
    })

    it("limit 截断发生在排序之后：先给最相关的，而不是先给树里靠前的", () => {
        expect(searchLeafPaths(paths, "数码", 1).map((p) => p.id)).toEqual(["存储卡"])
    })
})

describe("columnsOf", () => {
    it("未选中时也有一列：第 0 列永远是根层", () => {
        expect(columnsOf(tree, []).map((col) => col.map((n) => n.name))).toEqual([
            ["数码", "服饰", "空目录"],
        ])
    })

    it("选中末级就不再出下一列：给一个空列会让卖家以为还有得选", () => {
        const columns = columnsOf(tree, ["服饰", "男装"])

        expect(columns.map((col) => col.map((n) => n.name))).toEqual([
            ["数码", "服饰", "空目录"],
            ["男装"],
        ])
    })

    it("点到没有这个 id 的列：停住，不崩也不追加幽灵列", () => {
        const columns = columnsOf(tree, ["不存在的类目"])

        expect(columns).toHaveLength(1)
    })
})

describe("nodesOf / selectedLeafId", () => {
    it("断链就截断：脏 URL 参数不该让面包屑画出一个不存在的层级", () => {
        expect(nodesOf(tree, ["数码", "手机", "乱填"]).map((n) => n.name)).toEqual(["数码", "手机"])
    })

    it("选到中间级不算选完：进下一步的开关只看末级", () => {
        expect(selectedLeafId(tree, ["数码", "手机"])).toBeUndefined()
    })

    it("选到末级才返回它的 id", () => {
        expect(selectedLeafId(tree, ["数码", "手机", "存储卡"])).toBe("存储卡")
    })

    it("children 为空的节点按末级处理（isLeaf 判的是长度，不是「有没有这一字段」）", () => {
        expect(isLeaf(node("空目录"))).toBe(true)
        expect(selectedLeafId(tree, ["空目录"])).toBe("空目录")
    })
})

describe("selectAt", () => {
    it("点第 0 列换类目：其后的选择全部作废", () => {
        expect(selectAt(["数码", "手机", "存储卡"], 0, "服饰")).toEqual(["服饰"])
    })

    it("点中间列只截断它之后的：上一级保留，否则选路会被清空", () => {
        expect(selectAt(["数码", "手机", "存储卡"], 1, "平板")).toEqual(["数码", "平板"])
    })
})

describe("filterByName", () => {
    it("空白关键词原样返回该列（不是返回空列，那等于把整个选择器清屏）", () => {
        expect(filterByName(tree, "  ")).toBe(tree)
    })

    it("按名过滤大小写不敏感，且不深搜子级：只筛当列可见项", () => {
        const digital = tree.find((n) => n.name === "数码")!

        expect(filterByName(digital.children, "手")).toEqual([digital.children[0]])
        expect(filterByName(tree, "phone")).toEqual([])
    })
})
