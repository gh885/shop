import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Button, confirm, Skeleton } from "@shop/ui-web"
import { Plus } from "lucide-react"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { useShop } from "#/shop"
import { useT } from "#/locales/use-t"
import {
    addressListOptions,
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

function AddressListPending() {
    return (
        <div className="space-y-2">
            {[0, 1, 2].map((i) => (
                <Skeleton
                    key={i}
                    className="h-14 w-full rounded-lg"
                />
            ))}
        </div>
    )
}

function AddressPage() {
    const shop = useShop()
    const t = useT("shop")
    const addresses = useSuspenseQuery(addressListOptions(shop.id))
    const setDefaultShip = useSetDefaultShip(shop.id)
    const setDefaultReturn = useSetDefaultReturn(shop.id)
    const del = useDeleteAddress(shop.id)

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<MerchantAddressResponse | undefined>()
    const { busyId, run } = useRowBusy()

    const rows = addresses.data

    function confirmDelete(address: Pick<MerchantAddressResponse, "id" | "contactName">) {
        void confirm({
            title: t("shop.address.delete.confirm.title"),
            description: t("shop.address.delete.confirm.desc", {
                name: address.contactName,
            }),
            action: () => del.mutateAsync(address.id),
        })
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("shop.address.page.hint")}</p>
                <Button
                    onClick={() => {
                        setEditing(undefined)
                        setFormOpen(true)
                    }}
                >
                    <Plus className="size-4" />
                    {t("shop.address.page.add")}
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
