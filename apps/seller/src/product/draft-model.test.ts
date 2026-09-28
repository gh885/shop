import type { CategoryAttrNodeResponse, SkuResponse } from "@shop/api/sdk"
import { money } from "@shop/common"
import { makeCategoryAttrNode } from "@shop/test-utils/fixtures"

import { describe, expect, it } from "vite-plus/test"

import {
    buildSkuRowsFromSelections,
    countInputSchema,
    createValueRowId,
    derivePriceStock,
    draftsToSelections,
    mergeLocalPricedRows,
    mergeSkuRows,
    parseBatchFill,
    parseCountCell,
    parsePriceCell,
    rowFromSku,
    selectVisibleSkuRows,
    selectionsToDrafts,
    skuLabelOf,
    skuTextRowsForEdit,
    toSkuUpdateItems,
    toSkuUpdateItemsFromText,
    unpricedRows,
    yuanPriceSchema,
    type AttrDraft,
    type SkuDraftRow,
    type SkuTextRow,
} from "./draft-model"

// 夹具
/** 夹具 1：类目属性模板节点与选值的可控构造（模板节点顺序即维度顺序；金额/库存等字段与本模块无关，取合法默认值） */
function makeNode(
    attrId: string,
    name: string,
    values: string[],
    opts: { allowCustom?: boolean; allowImage?: boolean } = {},
): CategoryAttrNodeResponse {
    return makeCategoryAttrNode(
        { id: attrId, name, ...opts },
        values.map((value, i) => ({ id: `${attrId}-v${i}`, value })),
    )
}

function makeSelection(attrId: string, valueIds: string[] = [], customValues: string[] = []) {
    return { attrId, valueIds, customValues }
}

/**
 * 夹具 2：SkuResponse 可控构造（关心维度：label 拼接、价格/null、库存、编码、状态）。
 * 价格按「分」书写，夹具内换成 Money——测试正文不必到处写对象字面量。
 */
function makeSku(
    id: string,
    attrs: string[],
    opts: {
        price?: number | null
        stock?: number
        skuCode?: string | null
        status?: SkuResponse["status"]
    } = {},
): SkuResponse {
    const { price = 19900, stock = 5, skuCode = null, status = "ON_SALE" } = opts
    const priced = price === null ? null : money(price)
    return {
        id,
        productId: "p1",
        skuCode,
        name: id,
        attributes: attrs.map((value, i) => ({
            attrId: `a${i}`,
            valueId: `v${i}`,
            name: `规格${i}`,
            value,
        })),
        image: null,
        price: priced,
        originalPrice: priced,
        stock,
        status,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
    }
}

function makeRow(
    label: string,
    opts: Partial<Omit<SkuDraftRow, "price">> & { price?: number | null } = {},
): SkuDraftRow {
    const { price, ...rest } = opts
    return {
        skuId: null,
        label,
        price: typeof price === "number" ? money(price) : (price ?? null),
        stock: null,
        skuCode: null,
        status: "ON_SALE",
        ...rest,
    }
}

// 单元格输入规则（元文本 → Money）
describe("yuanPriceSchema", () => {
    it("合法输入换算成 Money（两位小数内，币种取平台定价币种），首尾空白被裁剪", () => {
        expect(yuanPriceSchema.parse("12.34")).toEqual(money(1234))
        expect(yuanPriceSchema.parse("0.1")).toEqual(money(10))
        expect(yuanPriceSchema.parse("0")).toEqual(money(0))
        expect(yuanPriceSchema.parse("0.00")).toEqual(money(0))
        expect(yuanPriceSchema.parse("  5  ")).toEqual(money(500))
    })

    it("非法格式被拒：负数/超两位小数/科学计数/纯符号", () => {
        expect(yuanPriceSchema.safeParse("-5").success).toBe(false)
        expect(yuanPriceSchema.safeParse("12.345").success).toBe(false)
        expect(yuanPriceSchema.safeParse("1e3").success).toBe(false)
        expect(yuanPriceSchema.safeParse("abc").success).toBe(false)
        expect(yuanPriceSchema.safeParse(".5").success).toBe(false)
    })

    it("空串/纯空白由调用方先判为清空（不进 schema）", () => {
        expect(yuanPriceSchema.safeParse("").success).toBe(false)
        expect(yuanPriceSchema.safeParse("   ").success).toBe(false)
    })
})

describe("countInputSchema", () => {
    it("非负整数直接换算", () => {
        expect(countInputSchema.parse("12")).toBe(12)
        expect(countInputSchema.parse("0")).toBe(0)
    })

    it("负数/小数/非数字被拒", () => {
        expect(countInputSchema.safeParse("-1").success).toBe(false)
        expect(countInputSchema.safeParse("1.5").success).toBe(false)
        expect(countInputSchema.safeParse("abc").success).toBe(false)
    })
})

// SKU 组合：模板选值 → 笛卡尔积行
describe("buildSkuRowsFromSelections", () => {
    it("无任何选值时生成单规格一行", () => {
        const rows = buildSkuRowsFromSelections([makeNode("a1", "颜色", ["红"])], [])

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ label: "单规格", skuId: null, status: "ON_SALE" })
    })

    it("只选了一个模板、没选值时仍是单规格（选了维度但值为空不算选择）", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", [], [])])

        expect(rows).toHaveLength(1)
        expect(rows[0]?.label).toBe("单规格")
    })

    it("单维度多值：每个值一行，label 用取值文本", () => {
        const template = [makeNode("a1", "颜色", ["红", "蓝"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0", "a1-v1"])])

        expect(rows.map((r) => r.label)).toEqual(["红", "蓝"])
    })

    it("多维度做笛卡尔积，且按模板维度顺序拼接 label", () => {
        const template = [makeNode("a1", "颜色", ["红", "蓝"]), makeNode("a2", "尺码", ["M", "L"])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", ["a1-v0", "a1-v1"]),
            makeSelection("a2", ["a2-v0", "a2-v1"]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["红 / M", "红 / L", "蓝 / M", "蓝 / L"])
    })

    it("模板里有但没被选的维度不进入组合", () => {
        const template = [makeNode("a1", "颜色", ["红"]), makeNode("a2", "尺码", ["M"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0"])])

        expect(rows.map((r) => r.label)).toEqual(["红"])
    })

    it("自定义值文本参与组合且首尾空白被裁剪，空文本被丢弃", () => {
        const template = [makeNode("a1", "颜色", [])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", [], ["  军绿  ", "   "]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["军绿"])
    })

    it("模板值与自定义值可同维度混用，模板值在前", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [
            makeSelection("a1", ["a1-v0"], ["军绿"]),
        ])

        expect(rows.map((r) => r.label)).toEqual(["红", "军绿"])
    })

    it("选值引用了不在模板里的 valueId 时安全跳过", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["ghost-id"])])

        expect(rows).toHaveLength(1)
        expect(rows[0]?.label).toBe("单规格")
    })

    it("生成的行全部是未设价/未填库存的新建态", () => {
        const template = [makeNode("a1", "颜色", ["红"])]
        const rows = buildSkuRowsFromSelections(template, [makeSelection("a1", ["a1-v0"])])

        expect(rows[0]).toMatchObject({ skuId: null, price: null, stock: null, skuCode: null })
    })
})

// wire → 可编辑行
describe("rowFromSku", () => {
    it("label 按属性值拼接；金额原样透传 Money（不做分/元互转），库存透传", () => {
        const row = rowFromSku(makeSku("s1", ["红", "M"], { price: 19900, stock: 3 }))

        expect(row).toMatchObject({
            skuId: "s1",
            label: "红 / M",
            price: money(19900),
            stock: 3,
        })
    })

    it("无属性的 SKU 是单规格行", () => {
        expect(rowFromSku(makeSku("s1", [])).label).toBe("单规格")
    })

    it("价格为 null 时行内也是 null（未设价 ≠ 0 元，不在边界之外归一）", () => {
        expect(rowFromSku(makeSku("s1", ["红"], { price: null })).price).toBeNull()
    })

    it("DISABLED 保留，其余状态归一为 ON_SALE", () => {
        expect(rowFromSku(makeSku("s1", [], { status: "DISABLED" })).status).toBe("DISABLED")
        expect(rowFromSku(makeSku("s1", [])).status).toBe("ON_SALE")
    })

    it("skuCode null 原样透传（省略发生在 wire 投影边界）", () => {
        expect(rowFromSku(makeSku("s1", [])).skuCode).toBeNull()
    })
})

// 对账合并（编辑态按稳定 skuId 保留已填值）
describe("mergeSkuRows", () => {
    it("组合没变（skuId 稳定）时带回上一轮已填的价格/库存/编码", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500, stock: 9, skuCode: "C1" })]
        const fresh = [makeSku("s1", ["红"], { price: 19900, stock: 5, skuCode: null })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            price: money(2500),
            stock: 9,
            skuCode: "C1",
        })
    })

    it("上一轮没填过的字段（null）用服务端回填值，不用 null 覆盖真值", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500 })]
        const fresh = [makeSku("s1", ["红"], { stock: 5 })]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            price: money(2500),
            stock: 5,
        })
    })

    it("显式填过 0 元也算已填（null 比较而不是 truthiness，0 不会被服务端值吞掉）", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 0 })]
        const fresh = [makeSku("s1", ["红"], { price: 19900 })]

        expect(mergeSkuRows(previous, fresh)[0]?.price).toEqual(money(0))
    })

    it("新组合（无 skuId 匹配）不残留旧行数据", () => {
        const previous = [makeRow("红", { skuId: "s1", price: 2500 })]
        const fresh = [makeSku("s2", ["蓝"])]

        expect(mergeSkuRows(previous, fresh)[0]).toMatchObject({
            skuId: "s2",
            price: money(19900),
        })
    })

    it("上一轮为空时全部用服务端行", () => {
        const fresh = [makeSku("s1", ["红"])]

        expect(mergeSkuRows(undefined, fresh)[0]).toMatchObject({ price: money(19900), stock: 5 })
    })
})

// 保存合并（新建态按 label 搬回已填值）
describe("mergeLocalPricedRows", () => {
    it("新建态按 label 匹配，把本地已填值搬回带 skuId 的服务端行", () => {
        const local = [makeRow("红 / M", { price: 2500, stock: 9 })]
        const serverRows = [makeRow("红 / M", { skuId: "s1", price: 19900, stock: 5 })]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            skuId: "s1",
            price: money(2500),
            stock: 9,
        })
    })

    it("本地没填（null）的字段保留服务端值", () => {
        const local = [makeRow("红", { price: 2500 })]
        const serverRows = [makeRow("红", { skuId: "s1", price: 19900, stock: 5, skuCode: "C1" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]).toMatchObject({
            price: money(2500),
            stock: 5,
            skuCode: "C1",
        })
    })

    it("状态跟随本地行（服务端新行默认态被覆盖）", () => {
        const local = [makeRow("红", { price: 2500, status: "DISABLED" })]
        const serverRows = [makeRow("红", { skuId: "s1" })]

        expect(mergeLocalPricedRows(local, serverRows)[0]?.status).toBe("DISABLED")
    })

    it("本地没有的组合原样保留服务端行", () => {
        const serverRows = [makeRow("蓝", { skuId: "s2", price: 19900 })]

        expect(mergeLocalPricedRows([], serverRows)[0]).toMatchObject({
            skuId: "s2",
            price: money(19900),
        })
    })
})

// 保存门槛与 wire 载荷
describe("unpricedRows", () => {
    it("price 为 null 即未设价（0 分是合法价，不算未设）", () => {
        const rows = [
            makeRow("红", { price: 0 }),
            makeRow("蓝"),
            makeRow("绿", { skuId: "s3", price: 19900 }),
        ]

        expect(unpricedRows(rows).map((r) => r.label)).toEqual(["蓝"])
    })
})

describe("toSkuUpdateItems", () => {
    it("只发已建档且已设价的行：空价不发（草稿无门槛的关键，不写 0）", () => {
        const rows = [
            makeRow("单规格", { skuId: "s1", price: 2500, stock: 9 }),
            makeRow("红", { skuId: "s2", price: null }),
            makeRow("蓝"), // 未建档本地行
        ]

        expect(toSkuUpdateItems(rows)).toHaveLength(1)
        expect(toSkuUpdateItems(rows)[0]).toMatchObject({
            skuId: "s1",
            price: money(2500),
            stock: 9,
        })
    })

    it("库存 null → 0（产品决策：没填库存的 SKU 落 0），编码空/空白 → 省略，只在此边界兜底", () => {
        const rows = [makeRow("红", { skuId: "s1", price: 2500, skuCode: "  C1  " })]

        expect(toSkuUpdateItems(rows)[0]).toMatchObject({ skuId: "s1", stock: 0, skuCode: "C1" })
        expect(
            toSkuUpdateItems([makeRow("红", { skuId: "s1", price: 2500, skuCode: "   " })])[0]
                ?.skuCode,
        ).toBeUndefined()
    })
})

// 销售属性取值行 ↔ 契约选择（编辑器的两次换算）
/** 夹具 3：AttrDraft 可控构造（模板值域与维度开关都与换算无关，取一组固定默认） */
function makeDraft(
    attrId: string,
    rows: { valueId?: string; value: string; image?: string }[],
): AttrDraft {
    return {
        attrId,
        name: "颜色",
        allowCustom: true,
        allowImage: false,
        values: [],
        rows: rows.map((r, i) => ({
            id: `v-${i + 1}`,
            valueId: r.valueId,
            value: r.value,
            image: r.image,
            note: "",
        })),
    }
}

describe("selectionsToDrafts（回显：契约选择 → 编辑行）", () => {
    it("模板值带 valueId 回显，自定义值不带；各自的取值图跟着回到对应行", () => {
        const drafts = selectionsToDrafts(
            [makeNode("a1", "颜色", ["红", "蓝"])],
            [
                {
                    attrId: "a1",
                    valueIds: ["a1-v1"],
                    customValues: ["荧光绿"],
                    valueImages: { "a1-v1": "img/蓝.jpg" },
                    customValueImages: { 荧光绿: "img/绿.jpg" },
                },
            ],
            createValueRowId(),
        )

        expect(drafts[0]?.rows).toEqual([
            { id: "v-1", valueId: "a1-v1", value: "蓝", image: "img/蓝.jpg", note: "" },
            { id: "v-2", valueId: undefined, value: "荧光绿", image: "img/绿.jpg", note: "" },
        ])
    })

    it("模板里已查不到的 valueId 仍建行：静默丢一个维度比留个空框更糟", () => {
        const drafts = selectionsToDrafts(
            [makeNode("a1", "颜色", ["红"])],
            [makeSelection("a1", ["gone"])],
            createValueRowId(),
        )

        expect(drafts[0]?.rows).toEqual([{ id: "v-1", valueId: "gone", value: "", note: "" }])
    })

    it("没选任何值也留一行空的，编辑器才有下手的地方", () => {
        const drafts = selectionsToDrafts([makeNode("a1", "颜色", ["红"])], [], createValueRowId())

        expect(drafts[0]?.rows).toEqual([{ id: "v-1", value: "", note: "" }])
    })

    it("行 id 由调用方给的计数器产出：两个编辑器各自编号，不互相吞号", () => {
        const ids = [createValueRowId(), createValueRowId()].map((nextId) => {
            const drafts = selectionsToDrafts([makeNode("a1", "颜色", ["红"])], [], nextId)
            return drafts[0]?.rows[0]?.id
        })

        expect(ids).toEqual(["v-1", "v-1"])
    })
})

describe("draftsToSelections（上抛：编辑行 → 契约选择）", () => {
    it("一个值都没填的维度整条不回传：空 customValues 到后端是非法输入", () => {
        expect(draftsToSelections([makeDraft("a1", [{ value: "  " }])])).toEqual([])
    })

    it("命中模板的进 valueIds、值域外的进 customValues，空白行谁都不进", () => {
        const selections = draftsToSelections([
            makeDraft("a1", [
                { valueId: "a1-v0", value: "红" },
                { value: "  荧光绿  " },
                { value: "" },
            ]),
        ])

        expect(selections).toEqual([
            { attrId: "a1", valueIds: ["a1-v0"], customValues: ["荧光绿"] },
        ])
    })

    it("取值图只收「有值且有图」的行，两边都空时省略对象而不是发 {}", () => {
        const [selection] = draftsToSelections([
            makeDraft("a1", [
                { valueId: "a1-v0", value: "红", image: "img/红.jpg" },
                { value: "", image: "img/废.jpg" },
            ]),
        ])

        expect(selection?.valueImages).toEqual({ "a1-v0": "img/红.jpg" })
        expect(selection?.customValueImages).toBeUndefined()
    })

    it("回显再原样上抛是同一次选择：不编辑规格时载荷不该长出一堆空值", () => {
        const selected = [
            {
                attrId: "a1",
                valueIds: ["a1-v1"],
                customValues: ["荧光绿"],
                valueImages: { "a1-v1": "img/蓝.jpg" },
            },
        ]
        const drafts = selectionsToDrafts(
            [makeNode("a1", "颜色", ["红", "蓝"])],
            selected,
            createValueRowId(),
        )

        expect(draftsToSelections(drafts)).toEqual(selected)
    })
})

// 单元格输入（文本 → 模型值 / 清空 / 非法）
describe("parsePriceCell / parseCountCell", () => {
    it("空串与纯空白都是「清空」而不是「格式不对」", () => {
        expect(parsePriceCell("")).toEqual({ value: null })
        expect(parsePriceCell("   ")).toEqual({ value: null })
    })

    it("非法输入给第一句提示：用户敲了个坏值不该被当成删掉", () => {
        expect(parsePriceCell("-5")).toEqual({
            value: null,
            error: "价格需为非负数字，最多两位小数",
        })
        expect(parseCountCell("1.5").error).toBe("数量需为非负整数")
    })

    it("合法输入换算回模型值，首尾空白先裁掉", () => {
        expect(parsePriceCell(" 12.34 ")).toEqual({ value: money(1234) })
        expect(parseCountCell("7")).toEqual({ value: 7 })
    })
})

describe("parseBatchFill（批量填写）", () => {
    it("空格给 undefined 而不是 null：批量清空价格从来不是意图", () => {
        expect(parseBatchFill("", "")).toEqual({ price: undefined, stock: undefined })
    })

    it("任一格非法就整批不落，另一半也不回传", () => {
        expect(parseBatchFill("1", "abc")).toEqual({ error: "数量需为非负整数" })
    })

    it("两格都给就两格都覆盖", () => {
        expect(parseBatchFill("9.9", "3")).toEqual({ price: money(990), stock: 3 })
    })
})

// 派生展示
describe("derivePriceStock", () => {
    it("未设价的行不进区间：一个空价格会把整档价拖到 0", () => {
        const rows = [
            makeRow("红", { price: 100, stock: 1 }),
            makeRow("蓝", { price: null, stock: 5 }),
        ]

        expect(derivePriceStock(rows)).toEqual({
            min: money(100),
            max: money(100),
            totalStock: 6,
        })
    })

    it("库存未填按 0 计入合计：与 toSkuUpdateItems 落库的 ?? 0 同口径，否则页面与库存差一件", () => {
        expect(derivePriceStock([makeRow("红", { price: 100 })]).totalStock).toBe(0)
    })

    it("全部未定价时区间为空（两个 undefined），由展示侧决定文案", () => {
        expect(derivePriceStock([makeRow("红")])).toEqual({
            min: undefined,
            max: undefined,
            totalStock: 0,
        })
    })
})

describe("selectVisibleSkuRows（搜索态保留原下标）", () => {
    const rows = [makeRow("红"), makeRow("蓝色 大号"), makeRow("绿", { skuCode: "G-1" })]

    it("关键词为空时按原顺序全给", () => {
        expect(selectVisibleSkuRows(rows, "").map((v) => v.index)).toEqual([0, 1, 2])
    })

    it("命中的是第 2 行就必须带 index=1：编辑按下标改的是整份 rows", () => {
        const visible = selectVisibleSkuRows(rows, "大号")

        expect(visible).toHaveLength(1)
        expect([visible[0]?.row.label, visible[0]?.index]).toEqual(["蓝色 大号", 1])
    })

    it("大小写不敏感，商家编码也参与匹配", () => {
        expect(selectVisibleSkuRows(rows, " g-1 ").map((v) => v.index)).toEqual([2])
    })
})

describe("skuLabelOf", () => {
    it("规格值快照用「 / 」拼接；属性位还在但值为空，不留尾分隔符", () => {
        expect(skuLabelOf(makeSku("s1", ["红", ""]))).toBe("红")
    })

    it("空快照 = 单规格：全站一个词，发布网格与编辑弹窗不再给同一个 SKU 两个名字", () => {
        expect(skuLabelOf(makeSku("s1", []))).toBe("单规格")
    })
})

// 编辑 SKU / 编辑库存弹窗
/** 夹具 4：弹窗的文本态行（价格模式改文本、库存模式回传原始价） */
function makeTextRow(over: Partial<SkuTextRow> = {}): SkuTextRow {
    return {
        skuId: "s1",
        label: "红",
        price: money(19900),
        priceText: "199.00",
        stockText: "7",
        stock: 7,
        skuCodeText: "",
        ...over,
    }
}

describe("skuTextRowsForEdit / toSkuUpdateItemsFromText", () => {
    it("回显文本由模型值格式化而来，不做二次解析", () => {
        const [row] = skuTextRowsForEdit([
            makeSku("s1", ["红"], { price: 19900, stock: 7, skuCode: "C1" }),
        ])

        expect(row).toMatchObject({
            skuId: "s1",
            label: "红",
            priceText: "199.00",
            stockText: "7",
            skuCodeText: "C1",
        })
    })

    it("价格模式：发的是输入框里的新价，库存按原始值原样回传（updateSkus 两者都当绝对量）", () => {
        expect(toSkuUpdateItemsFromText("price", [makeTextRow({ priceText: "9.90" })])).toEqual([
            { skuId: "s1", price: money(990), stock: 7 },
        ])
    })

    it("价格模式：编码 trim 后有才发，留空 = 不改（后端按非空字段 set）", () => {
        const [item] = toSkuUpdateItemsFromText("price", [makeTextRow({ skuCodeText: "  C1  " })])

        expect(item).toMatchObject({ skuCode: "C1" })
        expect(
            toSkuUpdateItemsFromText("price", [makeTextRow({ skuCodeText: "   " })])[0],
        ).not.toHaveProperty("skuCode")
    })

    it("库存模式：改库存文本，价格原样回传，编码这一维不碰", () => {
        expect(toSkuUpdateItemsFromText("stock", [makeTextRow({ stockText: "3" })])).toEqual([
            { skuId: "s1", price: money(19900), stock: 3 },
        ])
    })

    it("库存模式跳过未定价的行：把 null 发出去等于把 SKU 写成 0 元", () => {
        expect(toSkuUpdateItemsFromText("stock", [makeTextRow({ price: null })])).toEqual([])
    })
})
