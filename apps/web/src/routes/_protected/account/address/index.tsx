import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import {
    Button,
    Card,
    CardContent,
    Dialog,
    DialogContent,
    DialogTitle,
    Skeleton,
    Spinner,
} from "@shop/ui-web"
import { CircleAlert } from "lucide-react"

import type { Address } from "#/address"
import {
    AddressFormDialog,
    AddressTable,
    addressListOptions,
    useAddressList,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "#/address"
import { noop } from "@tanstack/react-query"

export const Route = createFileRoute("/_protected/account/address/")({
    // 客户端预热（受保护页 SSR 服务端拿不到 token，loader 在服务端直接跳过，见 _protected/route.tsx）：
    // hover/导航先拉好地址列表缓存，组件挂载即命中。query() 失败会 reject —— 预热而已，吞掉；
    // 错误仍由组件侧的就地错误态处理。
    loader: ({ context }) => {
        if (import.meta.env.SSR) return
        void context.queryClient.query(addressListOptions).catch(noop)
    },
    component: AddressPage,
    head: () => ({
        meta: [{ title: "收货地址 - 个人中心 - Shop" }],
    }),
})

function AddressPage() {
    const { data: addresses = [], isLoading, isError, onRetry } = useAddressList()
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

            {isError ? (
                <Card>
                    <CardContent className="flex flex-col items-start gap-3">
                        <div className="flex items-center gap-2 text-destructive">
                            <CircleAlert className="size-5" />
                            <span className="font-medium">地址列表加载失败</span>
                        </div>
                        <p className="text-muted-foreground">网络异常或服务暂时不可用，请重试。</p>
                        <Button
                            variant="outline"
                            disabled={isLoading}
                            onClick={onRetry}
                        >
                            重试
                        </Button>
                    </CardContent>
                </Card>
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
                    onSetDefault={(id) => setDefault.mutate(id)}
                    onUnsetDefault={(id) => unsetDefault.mutate(id)}
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
