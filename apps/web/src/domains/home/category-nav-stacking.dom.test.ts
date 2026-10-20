import { describe, expect, it } from "vite-plus/test"
import {
    STACKING_CONTEXT_PROPS,
    collectStackingContextAncestors,
    stackingContextReason,
    type ReadableStyle,
} from "./category-nav-stacking"

/** jsdom 的 getComputedStyle 对这批属性读回空串，测试里用假 style 注入（满足 ReadableStyle 即可） */
const fakeStyle = (props: Record<string, string>): ReadableStyle => ({
    getPropertyValue: (name) => props[name] ?? "",
})

const buildPanel = () => {
    document.body.innerHTML =
        '<main id="main"><section id="s"><div id="mod"></div></section></main>'
    const panel = document.getElementById("mod")
    if (!panel) throw new Error("夹具没挂上：body 里找不到 #mod")
    return panel
}

describe("stackingContextReason", () => {
    it("读不到（空串）一律放过 —— 否则 jsdom 里每个测试都假报", () => {
        expect(stackingContextReason(fakeStyle({}))).toBe("")
        expect(
            stackingContextReason(
                fakeStyle(Object.fromEntries(STACKING_CONTEXT_PROPS.map(([p]) => [p, ""]))),
            ),
        ).toBe("")
    })

    it("默认值不算命中", () => {
        expect(stackingContextReason(fakeStyle({ isolation: "auto" }))).toBe("")
        expect(stackingContextReason(fakeStyle({ transform: "none" }))).toBe("")
        expect(stackingContextReason(fakeStyle({ "will-change": "auto" }))).toBe("")
        expect(stackingContextReason(fakeStyle({ "backdrop-filter": "none" }))).toBe("")
        expect(stackingContextReason(fakeStyle({ opacity: "1" }))).toBe("")
    })

    it("明确命中就报，报的是属性名", () => {
        expect(stackingContextReason(fakeStyle({ isolation: "isolate" }))).toBe("isolation")
        expect(stackingContextReason(fakeStyle({ transform: "matrix(1,0,0,1,0,0)" }))).toBe(
            "transform",
        )
        expect(stackingContextReason(fakeStyle({ translate: "0 4px" }))).toBe("translate")
        expect(stackingContextReason(fakeStyle({ "backdrop-filter": "blur(4px)" }))).toBe(
            "backdrop-filter",
        )
        expect(stackingContextReason(fakeStyle({ "will-change": "transform" }))).toBe("will-change")
        expect(stackingContextReason(fakeStyle({ contain: "paint" }))).toBe("contain")
    })

    it("opacity < 1 也算（透明度会创建层叠上下文）", () => {
        expect(stackingContextReason(fakeStyle({ opacity: "0.99" }))).toBe("opacity < 1")
        expect(stackingContextReason(fakeStyle({ opacity: "0" }))).toBe("opacity < 1")
    })

    it("多个命中用 ` / ` 连接", () => {
        expect(stackingContextReason(fakeStyle({ isolation: "isolate", transform: "none" }))).toBe(
            "isolation",
        )
        expect(
            stackingContextReason(fakeStyle({ isolation: "isolate", "will-change": "transform" })),
        ).toBe("isolation / will-change")
    })

    it("isolation 的反面是 auto，不是 isolate —— 写反会让自检对最可能的元凶永不触发", () => {
        expect(stackingContextReason(fakeStyle({ isolation: "isolate" }))).toBe("isolation")
        expect(stackingContextReason(fakeStyle({ isolation: "auto" }))).toBe("")
    })
})

describe("collectStackingContextAncestors", () => {
    it("从起点的父级一路扫到 body（不含起点、不含 body），命中按由近到远排列", () => {
        const panel = buildPanel()
        const dirty = new Set(["s", "main"])
        expect(
            collectStackingContextAncestors(panel, (el) =>
                fakeStyle(el.id && dirty.has(el.id) ? { isolation: "isolate" } : {}),
            ),
        ).toEqual(["section(isolation)", "main(isolation)"])
    })

    it("起点自己脏不算 —— 它扫的是祖先，面板自己带 z-overlay 是正常的", () => {
        const panel = buildPanel()
        expect(
            collectStackingContextAncestors(panel, (el) =>
                fakeStyle(el.id === "mod" ? { isolation: "isolate" } : {}),
            ),
        ).toEqual([])
    })

    it("祖先链干净时返回空 —— 这正是当前 hero 的实际状态", () => {
        const panel = buildPanel()
        expect(collectStackingContextAncestors(panel, () => fakeStyle({}))).toEqual([])
    })

    it("起点为 null 不炸", () => {
        expect(collectStackingContextAncestors(null, () => fakeStyle({}))).toEqual([])
    })
})
