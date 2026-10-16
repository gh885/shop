import { describe, expect, it, vi } from "vite-plus/test"
import { useState } from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef } from "@tanstack/react-table"

import type { DataTableFeatures } from "@shop/ui-web"
import { renderWithRouter } from "@shop/app-kit/test"

import { ListShell, TextFilter } from "./list-shell"
import { PagedListShell, type SearchNavigate } from "./paged-list-shell"

type Row = { id: string; name: string }

const rows: Row[] = [
    { id: "1", name: "甲店" },
    { id: "2", name: "乙店" },
]

const columns: ColumnDef<DataTableFeatures, Row>[] = [
    { accessorKey: "name", header: "名称", meta: { variant: "strong" } },
]

const loaded = { data: { records: rows, total: 42 }, isPending: false }

// 带一个筛选键：翻页写回必须带着它，少了就是静默清筛选
const search = { page: 2, size: 10, status: "PENDING" }

type Search = typeof search

const couponSearch = { page: 3, size: 10, keyword: "满100" }

const outOfRangeSearch: Search = { page: 9, size: 10, status: "PENDING" }
const outOfRangeCouponSearch = { ...couponSearch, page: 9 }

const noopNavigate: SearchNavigate<Search> = () => {}

function Paged({
    navigate = noopNavigate,
    query = loaded,
    search: initial = search,
}: {
    navigate?: SearchNavigate<Search>
    query?: { data?: { records: Row[]; total: number }; isPending: boolean }
    search?: Search
}) {
    return (
        <PagedListShell
            title="店铺治理"
            description="挂起与恢复"
            search={initial}
            navigate={navigate}
            query={query}
            columns={columns}
            emptyContent="没有符合条件的店铺"
            filters={<span>筛选栏</span>}
        />
    )
}

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

    it("越界页码在数据落定后退回最后一页，并用 replace 写回：修正不是用户走了一步", async () => {
        const navigate = vi.fn<SearchNavigate<Search>>()
        renderWithRouter(
            <Paged
                navigate={navigate}
                search={outOfRangeSearch}
            />,
        )

        await screen.findByText("甲店")
        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith({
                search: { page: 5, size: 10, status: "PENDING" },
                replace: true,
            }),
        )
    })

    it("页码在范围内时一个 URL 都不写：否则每次数据变化都白导航一次", async () => {
        const navigate = vi.fn<SearchNavigate<Search>>()
        renderWithRouter(<Paged navigate={navigate} />)

        await screen.findByText("甲店")
        expect(navigate).not.toHaveBeenCalled()
    })

    it("ListShell 走同一份收口：陈旧 ?page=99 链接退回最后一页，筛选键不丢", async () => {
        const { router } = renderWithRouter(
            <ListShell
                title="优惠券运营"
                description="查询用户持有的优惠券"
                search={outOfRangeCouponSearch}
                query={loaded}
                columns={columns}
                emptyContent="暂无符合条件的优惠券"
            />,
            { initialEntry: "/?page=9&size=10&keyword=%E6%BB%A1100" },
        )

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({
                page: 5,
                size: 10,
                keyword: "满100",
            }),
        )
    })
})
