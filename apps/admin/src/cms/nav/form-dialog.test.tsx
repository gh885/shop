import type { NavEntryResponse } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"

import { adminMessages } from "#/locales"
import { screen, waitFor } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { CMS_TITLE_MAX } from "../constants"
import { NavFormDialog } from "./form-dialog"

const ENTRY: NavEntryResponse = {
    id: "00000000-0000-4000-8000-0000000000aa",
    navKey: "home",
    title: "首页导航",
    iconKey: null,
    target: null,
    targetType: null,
    subs: [{ name: "手机数码", items: ["iPhone"] }],
    sortOrder: 0,
    status: "ENABLED",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
}

function useNavRoutes() {
    const calls: { method: string; id?: string; body: unknown }[] = []
    server.use(
        http.post("*/admin/cms/nav", async ({ request }) => {
            calls.push({ method: "POST", body: await request.json() })
            return HttpResponse.json(ENTRY)
        }),
        http.put("*/admin/cms/nav/:id", async ({ request, params }) => {
            calls.push({ method: "PUT", id: String(params.id), body: await request.json() })
            return HttpResponse.json(ENTRY)
        }),
    )
    return calls
}

async function openDialog(user: UserEvent, editing?: NavEntryResponse) {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    renderWithProviders(
        <NavFormDialog
            open
            editing={editing}
            onOpenChange={onOpenChange}
        />,
        { resources: adminMessages },
    )
    await screen.findByRole("textbox", { name: "导航位" })
    return { onOpenChange, save: () => user.click(screen.getByRole("button", { name: "保存" })) }
}

const addGroup = (user: UserEvent) => user.click(screen.getByRole("button", { name: /添加分组/ }))

describe("NavFormDialog 的提交", () => {
    it("新增：POST 带上剔除空词条后的 subs，成功后收起", async () => {
        const calls = useNavRoutes()
        const user = userEvent.setup()
        const { onOpenChange, save } = await openDialog(user)

        await user.type(screen.getByRole("textbox", { name: "导航位" }), "category")
        await user.type(screen.getByRole("textbox", { name: "标题" }), "全部分类")
        await addGroup(user)
        await user.type(screen.getByPlaceholderText(/分组 1 名称/), "手机数码")
        await user.click(screen.getByRole("button", { name: "添加词条" }))
        await save()

        await waitFor(() => expect(calls).toHaveLength(1))
        expect(calls[0]).toMatchObject({
            method: "POST",
            body: { navKey: "category", title: "全部分类", subs: [{ name: "手机数码" }] },
        })
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("编辑：PUT 打在这一条上（走错通道就是新增出一条重复导航）", async () => {
        const calls = useNavRoutes()
        const user = userEvent.setup()
        const { save } = await openDialog(user, ENTRY)

        await user.type(screen.getByRole("textbox", { name: "标题" }), "改个名")
        await save()

        await waitFor(() => expect(calls).toHaveLength(1))
        expect(calls[0]).toMatchObject({ method: "PUT", id: ENTRY.id })
    })

    it("分组名为空：拦在本地并说明原因，一个请求都不发", async () => {
        const calls = useNavRoutes()
        const user = userEvent.setup()
        const { onOpenChange } = await openDialog(user)

        await user.type(screen.getByRole("textbox", { name: "导航位" }), "home")
        await user.type(screen.getByRole("textbox", { name: "标题" }), "首页导航")
        await addGroup(user)
        await user.click(screen.getByRole("button", { name: "保存" }))

        expect(await screen.findByText("分组名不能为空")).toBeInTheDocument()
        expect(calls).toHaveLength(0)
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("服务端 422 的字段级明细落进标题框，弹窗不收起", async () => {
        server.use(
            http.post("*/admin/cms/nav", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "title",
                                message: `标题最长 ${CMS_TITLE_MAX} 字`,
                                rule: "MAX_LENGTH",
                                max: CMS_TITLE_MAX,
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )
        const user = userEvent.setup()
        const { onOpenChange, save } = await openDialog(user)

        await user.type(screen.getByRole("textbox", { name: "导航位" }), "home")
        await user.type(screen.getByRole("textbox", { name: "标题" }), "首页导航")
        await save()

        expect(await screen.findByText(`最长 ${CMS_TITLE_MAX} 个字`)).toBeInTheDocument()
        expect(screen.queryByText(`标题最长 ${CMS_TITLE_MAX} 字`)).not.toBeInTheDocument()
        expect(onOpenChange).not.toHaveBeenCalled()
    })
})
