import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button, confirm, Skeleton } from "@shop/ui-web"
import { Plus } from "lucide-react"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { useShop } from "#/shop"
import {
    useAddressList,
    useDeleteAddress,
    useSetDefaultReturn,
    useSetDefaultShip,
} from "#/shop/address"
import { AddressTable } from "#/shop/address/AddressTable"
import { AddressFormDialog } from "#/shop/address/AddressFormDialog"
import { useRowBusy } from "#/shared/lib/use-row-busy"

export const Route = createFileRoute("/_app/shop/address")({
    component: AddressPage,
    pendingComponent: AddressListPending,
})

/** 地址列表是本页主体数据：suspense 加载中整页由路由边界兜骨架（useSuspenseQuery 在页面顶层挂起） */
function AddressListPending() {
    return (
        <div className="space-y-2">
            {[0, 1, 2].map((i) => (
                <Skeleton
                    key={i}
                    className="h-14 w-full rounded-xl"
                />
            ))}
        </div>
    )
}

function AddressPage() {
    const shop = useShop()
    const addresses = useAddressList(shop.id)
    const setDefaultShip = useSetDefaultShip(shop.id)
    const setDefaultReturn = useSetDefaultReturn(shop.id)
    const del = useDeleteAddress(shop.id)

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MerchantAddressResponse | undefined>()
    const { busyId, run } = useRowBusy()

    const rows = addresses.data

    /** 删除地址二次确认：确认即删，失败保持打开（错误提示走全局 mutation 反馈） */
    function confirmDelete(address: Pick<MerchantAddressResponse, "id" | "contactName">) {
        void confirm({
            title: "删除地址",
            description: `确定删除「${address.contactName}」的地址吗？删除后该地址不再用于发货/退货。`,
            action: () => del.mutateAsync(address.id),
        })
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    用来保存自己的发货、退货地址，您最多可添加 200 条地址。
                </p>
                <Button
                    onClick={() => {
                        setEditing(undefined)
                        setFormOpen(true)
                    }}
                >
                    <Plus className="size-4" />
                    新增地址
                </Button>
            </div>

            <AddressTable
                rows={rows}
                busyId={busyId}
                onEdit={(a) => {
                    setEditing(a)
                    setFormOpen(true)
                }}
                onDelete={confirmDelete}
                onSetDefaultShip={(id) => run(setDefaultShip.mutateAsync)(id)}
                onSetDefaultReturn={(id) => run(setDefaultReturn.mutateAsync)(id)}
            />

            <AddressFormDialog
                open={formOpen}
                onOpenChange={(open) => {
                    setFormOpen(open)
                    if (!open) setEditing(undefined)
                }}
                editing={editing}
                shopId={shop.id}
            />
        </div>
    )
}
