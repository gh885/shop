import { message } from "#/locales/message"
import { AdminShopsApi, type AdminShopItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { shopOpsKeys } from "./queries"

/**
 * 封店 / 解封。两件事的严重程度不同，按钮形态也不同：封店 destructive（级联下架、买家立刻看不见），
 * 解封 default（恢复营业，但不自动重上架——两件事的差别写进确认文案，见 ACC-60）。
 */
export function ShopSuspendAction({ shop }: { shop: AdminShopItem }) {
    const t = useT()
    const suspend = useMutation({
        mutationFn: () => AdminShopsApi.suspendShop({ path: { id: shop.id } }),
        meta: {
            success: message("admin.shopOps.suspend.done"),
            error: message("admin.shopOps.suspend.failed"),
            invalidates: [shopOpsKeys.all],
        },
    })

    if (shop.status !== "ACTIVE")
        return <span className="text-muted-foreground">{t("admin.shopOps.suspend.disabled")}</span>

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={suspend.isPending}
            onClick={() =>
                void confirm({
                    title: t("admin.shopOps.suspend.dialogTitle"),
                    description: t("admin.shopOps.suspend.dialogDescription", { name: shop.name }),
                    confirmText: t("admin.shopOps.suspend.confirm"),
                    action: suspend.mutateAsync,
                })
            }
        >
            {t("admin.shopOps.suspend.action")}
        </Button>
    )
}

export function ShopResumeAction({ shop }: { shop: AdminShopItem }) {
    const t = useT()
    const resume = useMutation({
        mutationFn: () => AdminShopsApi.resumeShop({ path: { id: shop.id } }),
        meta: {
            success: message("admin.shopOps.resume.done"),
            error: message("admin.shopOps.resume.failed"),
            invalidates: [shopOpsKeys.all],
        },
    })

    if (shop.status !== "DISABLED")
        return <span className="text-muted-foreground">{t("admin.shopOps.resume.disabled")}</span>

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={resume.isPending}
            onClick={() =>
                void confirm({
                    title: t("admin.shopOps.resume.dialogTitle"),
                    description: t("admin.shopOps.resume.dialogDescription", { name: shop.name }),
                    confirmText: t("admin.shopOps.resume.confirm"),
                    action: resume.mutateAsync,
                })
            }
        >
            {t("admin.shopOps.resume.action")}
        </Button>
    )
}
