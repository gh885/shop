import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { Button, Dialog, DialogContent, DialogTitle, Skeleton } from "@shop/ui-web"
import { CircleAlert } from "lucide-react"

import type { Address } from "#/entities/address"
import {
    AddressFormDialog,
    AddressTable,
    useAddressList,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "#/features/address"

export const Route = createFileRoute("/_protected/account/address/")({
    component: AddressPage,
    head: () => ({
        meta: [{ title: "收货地址 - 个人中心 - Shop" }],
    }),
})

function AddressPage() {
    const { data: addresses = [], isLoading, isError, refetch } = useAddressList()
    const del = useDeleteAddress()
    const setDefault = useSetDefaultAddress()
    const unsetDefault = useUnsetDefaultAddress()

    // 新增/编辑弹窗状态
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Address | null>(null)

    // 删除确认
    const [deleteTarget, setDeleteTarget] = useState<Address | null>(null)

    function openCreate() {
        setEditing(null)
        setDialogOpen(true)
    }

    function openEdit(a: Address) {
        setEditing(a)
        setDialogOpen(true)
    }

    function confirmDelete() {
        if (deleteTarget) del.mutate(deleteTarget.id)
        setDeleteTarget(null)
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

            {isError ? (
                <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-8">
                    <div className="flex items-center gap-2 text-destructive">
                        <CircleAlert className="size-5" />
                        <span className="font-medium">地址列表加载失败</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        网络异常或服务暂时不可用，请重试。
                    </p>
                    <Button
                        variant="outline"
                        disabled={isLoading}
                        onClick={() => void refetch()}
                    >
                        重试
                    </Button>
                </div>
            ) : isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                        <Skeleton
                            key={i}
                            className="h-12 w-full"
                        />
                    ))}
                </div>
            ) : (
                <AddressTable
                    addresses={addresses}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onSetDefault={(a) => setDefault.mutate(a.id)}
                    onUnsetDefault={(a) => unsetDefault.mutate(a.id)}
                />
            )}

            <AddressFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                editing={editing}
            />

            {/* 删除确认 */}
            <Dialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogTitle>删除收货地址</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        确定删除 {deleteTarget?.receiver} 的收货地址吗？
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={del.isPending}
                            onClick={confirmDelete}
                        >
                            {del.isPending ? "删除中…" : "删除"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
