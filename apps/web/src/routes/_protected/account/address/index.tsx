import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Button, Dialog, DialogContent, DialogTitle, Skeleton, Spinner } from "@shop/ui-web"

import type { Address } from "#/address"
import {
    AddressFormDialog,
    AddressTable,
    addressListOptions,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "#/address"
import { useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/address/")({
    /**
     * 数据在 loader 里读完再渲染（官方 loader-as-data-source）：
     * 挂起 → `pendingComponent`，失败 → 路由错误页 + 官方重置重试；SSR 阶段直接跳过。
     */
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...addressListOptions, staleTime: "static" })
    },
    pendingComponent: AddressListSkeleton,
    component: AddressPage,
    head: () => ({
        meta: [{ title: "收货地址 - 个人中心 - Shop" }],
    }),
})

/** 挂起占位：与地址表格同形的三行骨架 */
function AddressListSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">收货地址</h1>
            </div>
            <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton
                        key={i}
                        className="h-12 w-full"
                    />
                ))}
            </div>
        </div>
    )
}

function AddressPage() {
    // 主体数据由 loader 读完（失败已由路由错误页接管）
    const addresses = useSuspenseQuery(addressListOptions).data
    const del = useDeleteAddress()
    const setDefault = useSetDefaultAddress()
    const unsetDefault = useUnsetDefaultAddress()

    // 新增/编辑弹窗状态
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Address | undefined>()

    // 删除确认目标：只需「是哪条 + 怎么念」（地址本身由 useAddressList 持有）
    const [deleteTarget, setDeleteTarget] = useState<Pick<Address, "id" | "receiver"> | undefined>()

    function openCreate() {
        setEditing(undefined)
        setDialogOpen(true)
    }

    function openEdit(a: Address) {
        setEditing(a)
        setDialogOpen(true)
    }

    function confirmDelete() {
        if (deleteTarget) del.mutate(deleteTarget.id)
        setDeleteTarget(undefined)
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">收货地址</h1>
                <Button onClick={openCreate}>
                    <Plus />
                    新增收货地址
                </Button>
            </div>

            <AddressTable
                addresses={addresses}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onSetDefault={(id) => setDefault.mutate(id)}
                onUnsetDefault={(id) => unsetDefault.mutate(id)}
            />

            <AddressFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                editing={editing}
            />

            {/* 删除确认 */}
            <Dialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(undefined)}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogTitle>删除收货地址</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        确定删除 {deleteTarget?.receiver} 的收货地址吗？
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(undefined)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={del.isPending}
                            onClick={confirmDelete}
                        >
                            {del.isPending && <Spinner />}删除
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
