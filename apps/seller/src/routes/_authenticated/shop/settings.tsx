import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import { SellerShopControllerApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"

import { confirm } from "@shop/ui-web"

import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { useCurrentShop } from "#/domains/shop"
import { SubmitButton } from "@shop/app-kit/auth"
import { useAppForm } from "@shop/ui-web"
import { Button, Input, Label } from "@shop/ui-web"

export const Route = createFileRoute("/_authenticated/shop/settings")({
    component: ShopSettingsPage,
})

/**
 * 店铺设置：改名即时生效；关店走确认弹窗——终态操作必须有一次明确确认，
 * 弹窗里直接跑 mutation（confirm 的 action promise：失败保持打开，错误 toast 归全局）。
 */
function ShopSettingsPage() {
    const t = useT()
    const shop = useCurrentShop()

    const rename = useMutation({
        mutationFn: (name: string) => SellerShopControllerApi.renameShop({ body: { name } }),
        meta: {
            success: message("shop.settings.renameDone"),
            error: message("shop.settings.renameFailed"),
        },
    })

    const close = useMutation({
        mutationFn: (reason: string) =>
            SellerShopControllerApi.closeShop({ body: { reason: reason || undefined } }),
        meta: {
            success: message("shop.settings.closeDone"),
            error: message("shop.settings.closeFailed"),
        },
    })

    const form = useAppForm({
        defaultValues: { name: shop?.name ?? "" },
        validators: {
            onSubmit: z.object({ name: z.string().trim().min(1, t("shop.settings.nameRequired")) }),
        },
        onSubmit: async ({ value }) => {
            await rename.mutateAsync(value.name.trim())
        },
    })

    const [closeReason, setCloseReason] = useState("")

    const askClose = () => {
        void confirm({
            title: t("shop.settings.closeTitle"),
            description: t("shop.settings.closeBody"),
            confirmText: t("shop.settings.close"),
            tone: "destructive",
            action: () => close.mutateAsync(closeReason.trim()),
        })
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold">{t("shop.settings.title")}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    {t("shop.settings.description")}
                </p>
            </div>
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
                className="max-w-md space-y-4"
            >
                <form.AppField name="name">
                    {(field) => (
                        <field.TextField
                            label={t("shop.settings.name")}
                            type="text"
                        />
                    )}
                </form.AppField>
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("shop.settings.rename")}
                        />
                    )}
                </form.Subscribe>
            </form>

            <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 p-4">
                <Label htmlFor="close-reason">{t("shop.settings.closeReason")}</Label>
                <Input
                    id="close-reason"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                />
                <Button
                    variant="destructive"
                    onClick={askClose}
                    disabled={close.isPending}
                >
                    {t("shop.settings.close")}
                </Button>
            </div>
        </div>
    )
}
