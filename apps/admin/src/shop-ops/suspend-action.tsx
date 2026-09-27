import { AdminShopsApi, type AdminShopItem } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { Button, confirm } from "@shop/ui-web"
import { shopOpsKeys } from "./queries"

/**
 * 封店 / 解封。两件事的严重程度不同，按钮形态也不同：封店 destructive（级联下架、买家立刻看不见），
 * 解封 default（恢复营业，但不自动重上架——两件事的差别写进确认文案，见 ACC-60）。
 */
export function ShopSuspendAction({ shop }: { shop: AdminShopItem }) {
    const suspend = useMutation({
        mutationFn: () => AdminShopsApi.suspendShop({ path: { id: shop.id } }),
        meta: { success: "店铺已封停", error: "封店失败", invalidates: [shopOpsKeys.all] },
    })

    if (shop.status !== "ACTIVE") return <span className="text-muted-foreground">不可封店</span>

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={suspend.isPending}
            onClick={() =>
                void confirm({
                    title: "封停店铺",
                    description: `确认封停「${shop.name}」？封店后该店在架商品会一并下架，买家侧立即不可见；解封不会自动把商品重新上架。`,
                    confirmText: "封停",
                    action: suspend.mutateAsync,
                })
            }
        >
            封店
        </Button>
    )
}

export function ShopResumeAction({ shop }: { shop: AdminShopItem }) {
    const resume = useMutation({
        mutationFn: () => AdminShopsApi.resumeShop({ path: { id: shop.id } }),
        meta: { success: "店铺已解封", error: "解封失败", invalidates: [shopOpsKeys.all] },
    })

    if (shop.status !== "DISABLED") return <span className="text-muted-foreground">不可解封</span>

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={resume.isPending}
            onClick={() =>
                void confirm({
                    title: "解封店铺",
                    description: `确认解封「${shop.name}」？店铺恢复营业，但已被下架的商品不会自动重新上架（需卖家自行上架）。`,
                    confirmText: "解封",
                    action: resume.mutateAsync,
                })
            }
        >
            解封
        </Button>
    )
}
