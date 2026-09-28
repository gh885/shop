import { describe, expect, it } from "vite-plus/test"

import { makeCategoryNode } from "@shop/test-utils/fixtures"

import { CATEGORY_MAX_LEVEL } from "./constants"
import {
    appendSort,
    canNestUnder,
    CATEGORY_ROOT_ID,
    indexCategoryTree,
    isLeafCategory,
    moveWithinSiblings,
    orderUpdates,
    parentIdOf,
} from "./tree"

/**
 * 类目树的形状变换。这些是「排序」与「层级」两条规则唯一的落点，
 * 所以单测钉的是规则本身：一级挂在合成根下、sort 按 10/20/30 重算、越界不动任何东西。
 */

const shirt = makeCategoryNode({ id: "c3", name: "T恤", level: 3, parentId: "c2" })
const coat = makeCategoryNode({
    id: "c2",
    name: "上装",
    level: 2,
    parentId: "c1",
    children: [shirt],
})
const clothes = makeCategoryNode({ id: "c1", name: "服装", children: [coat] })
const food = makeCategoryNode({ id: "c9", name: "食品" })
const tree = [clothes, food]

describe("indexCategoryTree", () => {
    it("拍平索引：一级挂在合成根下，子项顺序原样保留", () => {
        const index = indexCategoryTree(tree)

        expect(index.childIds[CATEGORY_ROOT_ID]).toEqual(["c1", "c9"])
        expect(index.childIds.c1).toEqual(["c2"])
        expect(index.childIds.c2).toEqual(["c3"])
        expect(index.childIds.c3).toEqual([])
        expect(index.byId.c3?.name).toBe("T恤")
    })

    it("parentIdOf：一级类目的父级是合成根（后端给的是零 UUID 占位）", () => {
        const index = indexCategoryTree(tree)

        expect(parentIdOf(index, "c1")).toBe(CATEGORY_ROOT_ID)
        expect(parentIdOf(index, "c2")).toBe("c1")
        expect(parentIdOf(index, "c3")).toBe("c2")
    })
})

describe("moveWithinSiblings", () => {
    it("相邻互换：返回新序列且不动原数组", () => {
        const ids = ["a", "b", "c"]

        expect(moveWithinSiblings(ids, 2, -1)).toEqual(["a", "c", "b"])
        expect(ids).toEqual(["a", "b", "c"])
    })

    it("越界原样返回**同一个引用**（调用点靠它判断「没动」，不发空请求）", () => {
        const ids = ["a", "b"]

        expect(moveWithinSiblings(ids, 0, -1)).toBe(ids)
        expect(moveWithinSiblings(ids, 1, 1)).toBe(ids)
        expect(moveWithinSiblings([], 0, 1)).toEqual([])
    })
})

describe("orderUpdates", () => {
    it("按 10/20/30 重排，只交出真的变了的行", () => {
        const index = indexCategoryTree(tree)

        // 现状 sort 全是 0：整表重排时每一行都要更新
        expect(orderUpdates(index.childIds[CATEGORY_ROOT_ID] ?? [], index.byId)).toEqual([
            { id: "c1", name: "服装", iconUrl: null, sort: 10 },
            { id: "c9", name: "食品", iconUrl: null, sort: 20 },
        ])
    })

    it("相邻互换只动两行（已按 10 的倍数排好时）", () => {
        const ordered = makeCategoryNode({ id: "c1", name: "服装", sort: 10, children: [coat] })
        const other = makeCategoryNode({ id: "c9", name: "食品", sort: 20 })
        const index = indexCategoryTree([ordered, other])

        const updates = orderUpdates(["c9", "c1"], index.byId)

        expect(updates).toEqual([
            { id: "c9", name: "食品", iconUrl: null, sort: 10 },
            { id: "c1", name: "服装", iconUrl: null, sort: 20 },
        ])
    })

    it("顺序没变时交出空数组（不白打一次 PUT）", () => {
        const ordered = makeCategoryNode({ id: "c1", name: "服装", sort: 10, children: [coat] })
        const other = makeCategoryNode({ id: "c9", name: "食品", sort: 20 })
        const index = indexCategoryTree([ordered, other])

        expect(orderUpdates(["c1", "c9"], index.byId)).toEqual([])
    })

    it("合成根这个不存在的节点被跳过，不会造出一条空 id 的更新", () => {
        const index = indexCategoryTree(tree)

        expect(orderUpdates([CATEGORY_ROOT_ID, "c1"], index.byId)).toEqual([
            { id: "c1", name: "服装", iconUrl: null, sort: 20 },
        ])
    })
})

describe("appendSort", () => {
    it("新节点排在末尾：与重排同一套步长", () => {
        const index = indexCategoryTree(tree)

        expect(appendSort(index, CATEGORY_ROOT_ID)).toBe(30)
        expect(appendSort(index, "c2")).toBe(20)
    })

    it("空父级给第一个位置", () => {
        expect(appendSort(indexCategoryTree([]), CATEGORY_ROOT_ID)).toBe(10)
    })
})

describe("层级上限的两句判定", () => {
    it("叶子那一层不能再挂子级，且它才是属性模板所在的一层", () => {
        expect(canNestUnder(CATEGORY_MAX_LEVEL)).toBe(false)
        expect(isLeafCategory(CATEGORY_MAX_LEVEL)).toBe(true)
    })

    it("叶子以下每一级都能挂子级，且都不是商品挂载点", () => {
        for (let level = 1; level < CATEGORY_MAX_LEVEL; level += 1) {
            expect(canNestUnder(level)).toBe(true)
            expect(isLeafCategory(level)).toBe(false)
        }
    })

    it("超过上限的脏值既不放开新建按钮也不算叶子（后端会拒，前端不跟着说谎）", () => {
        expect(canNestUnder(CATEGORY_MAX_LEVEL + 1)).toBe(false)
        expect(isLeafCategory(CATEGORY_MAX_LEVEL + 1)).toBe(false)
    })

    it("只看层级这一格：合成根的 0 级同样给放开（能不能挂由调用点另判）", () => {
        expect(canNestUnder(0)).toBe(true)
        expect(isLeafCategory(0)).toBe(false)
    })
})
