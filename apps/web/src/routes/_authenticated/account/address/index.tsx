import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import { Plus } from "lucide-react"

import { Button, Dialog, DialogContent, DialogTitle, Skeleton, Spinner } from "@shop/ui-web"

import type { Address } from "#/domains/address"
import {
    AddressFormDialog,
    AddressTable,
    addressListOptions,
    useDeleteAddress,
    useSetDefaultAddress,
    useUnsetDefaultAddress,
} from "#/domains/address"
import { useSuspenseQuery } from "@tanstack/react-query"

export const Route = createFileRoute("/_authenticated/account/address/")({
    loader: async ({ context }) => {
        if (import.meta.env.SSR) return
        await context.queryClient.query({ ...addressListOptions, staleTime: "static" })
    },
    pendingComponent: AddressListSkeleton,
    component: AddressPage,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.address", match.context.locale) }],
    }),
})

function AddressListSkeleton() {
    const t = useT()
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{t("account.menu.address")}</h2>
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
    const t = useT()
    const addresses = useSuspenseQuery(addressListOptions).data
    const del = useDeleteAddress()
    const setDefault = useSetDefaultAddress()
    const unsetDefault = useUnsetDefaultAddress()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Address | undefined>()

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
                <h2 className="text-xl font-bold">{t("account.menu.address")}</h2>
                <Button onClick={openCreate}>
                    <Plus />
                    {t("account.address.add")}
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

            <Dialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => !open && setDeleteTarget(undefined)}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogTitle>{t("account.address.deleteTitle")}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        {t("account.address.deleteConfirm", {
                            receiver: deleteTarget?.receiver ?? "",
                        })}
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(undefined)}
                        >
                            {t("confirm.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={del.isPending}
                            onClick={confirmDelete}
                        >
                            {del.isPending && <Spinner />}
                            {t("account.address.delete")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
