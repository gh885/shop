import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button, ConfirmDialog, Skeleton } from "@shop/ui-web"
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
})

/** 待确认删除的地址：只要「是哪条 + 怎么念」（地址本身由 useAddressList 持有） */
type PendingDelete = Pick<MerchantAddressResponse, "id" | "contactName"> | undefined

function AddressPage() {
    const shop = useShop()
    const addresses = useAddressList(shop.id)
    const setDefaultShip = useSetDefaultShip(shop.id)
    const setDefaultReturn = useSetDefaultReturn(shop.id)
    const del = useDeleteAddress(shop.id)

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MerchantAddressResponse | undefined>()
    const [pendingDelete, setPendingDelete] = useState<PendingDelete>()
    const { busyId, run } = useRowBusy()

    const rows = addresses.data ?? []

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

            {addresses.isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-14 w-full rounded-xl"
                        />
                    ))}
                </div>
            ) : (
                <AddressTable
                    rows={rows}
                    busyId={busyId}
                    onEdit={(a) => {
                        setEditing(a)
                        setFormOpen(true)
                    }}
                    onDelete={setPendingDelete}
                    onSetDefaultShip={(id) => run(setDefaultShip.mutateAsync)(id)}
                    onSetDefaultReturn={(id) => run(setDefaultReturn.mutateAsync)(id)}
                />
            )}

            <AddressFormDialog
                open={formOpen}
                onOpenChange={(open) => {
                    setFormOpen(open)
                    if (!open) setEditing(undefined)
                }}
                editing={editing}
                shopId={shop.id}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={(open) => !open && setPendingDelete(undefined)}
                title="删除地址"
                description={
                    <>
                        确定删除「{pendingDelete?.contactName}
                        」的地址吗？删除后该地址不再用于发货/退货。
                    </>
                }
                onConfirm={() => {
                    if (pendingDelete) del.mutate(pendingDelete.id)
                    setPendingDelete(undefined)
                }}
            />
        </div>
    )
}
