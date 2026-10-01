import type { NavEntryResponse } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { CMS_TITLE_MAX } from "../constants"
import { NavFormDialog } from "./form-dialog"

/**
 * 导航条目弹窗的提交那一段（新增 / 编辑 / 拦在本地 / 后端裁定落框）。
 *
 * 这张表单的形状特殊：标量走 `useAppForm`，`subs` 是 `SubsEditor` 那份**独立受控状态**，
 * 提交时先过 `SubsSchema` 再拼进请求体。所以四件事各钉一条：
 * ① 新增发的是 POST，且空词条在提交时被剔除（`toNavRequest` 的口径，不是编辑器删的）；
 * ② 编辑发的是 PUT 且带上条目 id（两张弹窗共用一体，走错通道就是新增出一条重复导航）；
 * ③ `subs` 不合法时拦在本地、一句请求都不发——它是 form 之外的一格，表单自己的校验管不到它；
 * ④ 后端 422 的字段级明细落进对应输入框、弹窗不收起（`subs` 那一条刻意不在白名单里：
 *    它没有对应的框，宁可只由 toast 讲，也不塞进某个全局格子）。
 */

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

/** 打开弹窗（新增或编辑）并等表单体挂上——BaseUI 关闭即卸载，内容不是当场就在的 */
async function openDialog(user: UserEvent, editing?: NavEntryResponse) {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    renderWithProviders(
        <NavFormDialog
            open
            editing={editing}
            onOpenChange={onOpenChange}
        />,
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
            // 新加的那行空词条不进请求体：留着它就是把「还没填」当成一条真词条存下去
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

    /**
     * 422 落框：`title` 同名进白名单，那句话由 catalog 按 rule 出（后端 `message` 只进日志）。
     * maxLength 平时先把着打字这条路，所以必须真发出去才走得到这条分支。
     */
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
