import { useMutation } from "@tanstack/react-query"

import { SellerShopControllerApi } from "@shop/api/sdk"

import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { Alert, AlertDescription, AlertTitle, Button } from "@shop/ui-web"

import { shopKeys } from "./queries"

/**
 * 入驻状态横幅。入驻不再阻塞登录与浏览——身份即时成立，只有「能不能卖」被治理侧挡着，
 * 所以这里只做告知与重提入口，不把人锁在门外：
 *
 * - `pending`：审核中，说明即可
 * - `rejected`：展示驳回理由（改什么的依据）+ 重提按钮；重提后经 /me 失效刷新状态
 * - `approved` / null（种子商家）：不渲染
 */
export function OnboardingBanner({
    status,
    rejectReason,
}: {
    status: string | null | undefined
    rejectReason: string | null | undefined
}) {
    const t = useT()
    const resubmit = useMutation({
        mutationFn: () => SellerShopControllerApi.resubmit({}),
        meta: {
            error: message("shop.onboarding.resubmitFailed"),
            invalidates: [shopKeys.all],
        },
    })

    if (status === "pending") {
        return (
            <Alert className="mb-4">
                <AlertTitle>{t("shop.onboarding.pending")}</AlertTitle>
            </Alert>
        )
    }
    if (status === "rejected") {
        return (
            <Alert
                variant="destructive"
                className="mb-4"
            >
                <AlertTitle>{t("shop.onboarding.rejected")}</AlertTitle>
                {rejectReason ? <AlertDescription>{rejectReason}</AlertDescription> : undefined}
                <div className="mt-3">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={resubmit.isPending}
                        onClick={() => resubmit.mutate()}
                    >
                        {t("shop.onboarding.resubmit")}
                    </Button>
                </div>
            </Alert>
        )
    }
    return undefined
}
