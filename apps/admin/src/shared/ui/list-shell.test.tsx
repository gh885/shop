import { describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"

import type { DataTableFeatures } from "@shop/ui-web"
import { renderWithRouter } from "@shop/app-kit/test"

import { ListShell, TextFilter } from "./list-shell"
import { PagedListShell } from "./paged-list-shell"

type Row = { id: string; name: string }

const rows: Row[] = [
    { id: "1", name: "甲店" },
    { id: "2", name: "乙店" },
]

const columns: ColumnDef<DataTableFeatures, Row>[] = [
    { accessorKey: "name", header: "名称", meta: { variant: "strong" } },
]

const loaded = { data: { records: rows, total: 42 }, isPending: false }

/** URL 状态刻意带一个筛选键：翻页写回必须带着它，少了就是静默清筛选 */
const search = { page: 2, size: 10, status: "PENDING" }

type Search = typeof search

/** `ListShell` 的 search 只声明 page/size，筛选键由路由的 validateSearch 决定 */
const couponSearch = { page: 3, size: 10, keyword: "满100" }

const noopNavigate: (options: { search: Search }) => void = () => {}

function Paged({
    navigate = noopNavigate,
    query = loaded,
}: {
    navigate?: (options: { search: Search }) => void
    query?: { data?: { records: Row[]; total: number }; isPending: boolean }
}) {
    return (
        <PagedListShell
            title="店铺治理"
            description="挂起与恢复"
            search={search}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent="没有符合条件的店铺"
            filters={<span>筛选栏</span>}
        />
    )
}

/** 真实筛选栏的形状：文本是本地草稿，只在挂载时读一次 URL（回车才写回） */
type HarnessSearch = { page: number; size: number; status?: string; keyword?: string }

function DraftFilters({ search }: { search: HarnessSearch }) {
    const [keyword, setKeyword] = useState(search.keyword ?? "")
    return (
        <input
            aria-label="关键词"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
        />
    )
}

/** 两颗按钮代表两种 URL 写回：改枚举（选中即提交）与改草稿那一格（后退 / 侧栏回到本页） */
function DraftHarness({
    draftKeys,
}: {
    draftKeys?: Exclude<keyof HarnessSearch, "page" | "size">[]
}) {
    const [search, setSearch] = useState<HarnessSearch>({
        page: 1,
        size: 10,
        status: "PENDING",
        keyword: "满100",
    })

    return (
        <>
            <button
                type="button"
                onClick={() => setSearch((prev) => ({ ...prev, status: "CLOSED" }))}
            >
                切换状态枚举
            </button>
            <button
                type="button"
                onClick={() => setSearch((prev) => ({ ...prev, keyword: "外部值" }))}
            >
                外部改关键词
            </button>
            <PagedListShell
                title="店铺治理"
                description="挂起与恢复"
                search={search}
                navigate={() => {}}
                query={loaded}
                columns={columns}
                emptyContent="没有符合条件的店铺"
                draftKeys={draftKeys}
                filters={<DraftFilters search={search} />}
            />
        </>
    )
}

/**
 * 列表外壳的接线测试。要钉的四件事都是页面管不了、错了也不报类型的：
 *  1) 翻页写回的是**整份** URL 状态——`navigate({ search: 对象 })` 是整体替换，
 *     只写 page/size 就把筛选条件静默清了；
 *  2) 加载态与空态由 `ListBody` 二选一（各页自己写三元迟早各写错一次）；
 *  3) `ListShell` 的文本筛选没有 state：初值取 URL、回车才提交，
 *     走的是 FormData → 写回 → 回第 1 页那条链；
 *  4) `PagedListShell` 重挂筛选栏只看 `draftKeys`：枚举筛选选中即提交，
 *     它写回 URL 时若把没回车的文本草稿一起冲掉，用户看到的是输入凭空蒸发。
 */
describe("列表外壳", () => {
    it("翻页带着筛选写回整份 URL 状态", async () => {
        const user = userEvent.setup()
        const navigate = vi.fn<(options: { search: Search }) => void>()

        renderWithRouter(<Paged navigate={navigate} />)

        await screen.findByText("甲店")
        await user.click(screen.getByRole("button", { name: "下一页" }))
        expect(navigate).toHaveBeenCalledWith({
            search: { page: 3, size: 10, status: "PENDING" },
        })
    })

    it("加载中出骨架不出数据", async () => {
        renderWithRouter(<Paged query={{ isPending: true }} />)

        await screen.findByText("店铺治理")
        expect(screen.queryByText("甲店")).not.toBeInTheDocument()
    })

    it("空结果出文案不出表", async () => {
        renderWithRouter(<Paged query={{ data: { records: [], total: 0 }, isPending: false }} />)

        expect(await screen.findByText("没有符合条件的店铺")).toBeInTheDocument()
    })

    it("文本筛选初值取 URL，回车把草稿并进 URL 且回到第 1 页", async () => {
        const user = userEvent.setup()

        const { router } = renderWithRouter(
            <ListShell
                title="优惠券运营"
                description="查询用户持有的优惠券"
                search={couponSearch}
                query={loaded}
                columns={columns}
                emptyContent="暂无符合条件的优惠券"
            >
                <TextFilter
                    name="keyword"
                    label="关键词"
                />
            </ListShell>,
            { initialEntry: "/?page=3&size=10&keyword=%E6%BB%A1100" },
        )

        const input = await screen.findByRole("textbox", { name: "关键词" })
        expect(input).toHaveValue("满100")

        await user.clear(input)
        await user.type(input, "已过期{Enter}")
        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({
                keyword: "已过期",
                page: 1,
                size: 10,
            }),
        )
    })

    it("枚举筛选写回 URL：没回车的文本草稿还在", async () => {
        const user = userEvent.setup()
        renderWithRouter(<DraftHarness draftKeys={["keyword"]} />)

        const input = await screen.findByRole("textbox", { name: "关键词" })
        await user.clear(input)
        await user.type(input, "已过期")

        await user.click(screen.getByRole("button", { name: "切换状态枚举" }))

        expect(screen.getByRole("textbox", { name: "关键词" })).toHaveValue("已过期")
    })

    it("草稿那一格的 URL 变了才重新播种（后退 / 侧栏回到本页）", async () => {
        const user = userEvent.setup()
        renderWithRouter(<DraftHarness draftKeys={["keyword"]} />)

        expect(await screen.findByRole("textbox", { name: "关键词" })).toHaveValue("满100")

        await user.click(screen.getByRole("button", { name: "外部改关键词" }))

        await waitFor(() =>
            expect(screen.getByRole("textbox", { name: "关键词" })).toHaveValue("外部值"),
        )
    })
})
