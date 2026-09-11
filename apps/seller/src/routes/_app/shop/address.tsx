import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button, ConfirmDialog, Skeleton, StateError } from "@shop/ui-web"
import { toApiError } from "@shop/common"
import { Plus } from "lucide-react"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { useCurrentShop } from "#/shop"
import {
    useAddressList,
    useDeleteAddress,
    useSetDefaultReturn,
    useSetDefaultShip,
} from "#/shop/address"
import { AddressTable } from "#/shop/address/AddressTable"
import { AddressFormDialog } from "#/shop/address/AddressFormDialog"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import { ShopRequired } from "#/shared/ui/ShopRequired"

export const Route = createFileRoute("/_app/shop/address")({
    component: AddressPage,
})

/** 待确认删除的地址 */
type PendingDelete = MerchantAddressResponse | undefined

function AddressPage() {
    const shop = useCurrentShop()
    const addresses = useAddressList()
    const setDefaultShip = useSetDefaultShip()
    const setDefaultReturn = useSetDefaultReturn()
    const del = useDeleteAddress()

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MerchantAddressResponse | undefined>()
    const [pendingDelete, setPendingDelete] = useState<PendingDelete>()
    const { busyId, run } = useRowBusy()

    if (!shop) {
        return <ShopRequired />
    }

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

            {addresses.isError ? (
                <StateError
                    message={toApiError(addresses.error).detail}
                    onRetry={() => void addresses.refetch()}
                    retrying={addresses.isFetching}
                />
            ) : addresses.isLoading ? (
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
                    onSetDefaultShip={(a) => run(setDefaultShip.mutateAsync)(a.id)}
                    onSetDefaultReturn={(a) => run(setDefaultReturn.mutateAsync)(a.id)}
                />
            )}

            <AddressFormDialog
                open={formOpen}
                onOpenChange={(open) => {
                    setFormOpen(open)
                    if (!open) setEditing(undefined)
                }}
                editing={editing}
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
