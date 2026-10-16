import { message } from "#/locales/message"
import { Headphones, Store } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@shop/ui-web"

import { errorText, useI18n } from "@shop/app-kit/i18n"
import { notify, QueryBoundary } from "@shop/app-kit/data"
import { toApiError } from "@shop/common/contract"
import { useT } from "#/locales/use-t"

import { ShopCouponPopover } from "#/coupon"
import { avatarInitial } from "#/shared/lib/avatar"
import { imgUrl } from "#/shared/lib/image"

import { ShopBarError, ShopBarSkeleton } from "./ShopBarStates"
import { shopOptions } from "./queries"

export function ShopBar({ shopId }: { shopId: string }) {
    return (
        <QueryBoundary
            pending={<ShopBarSkeleton />}
            fallback={(args) => <ShopBarErrorFallback {...args} />}
        >
            <ShopBarContent shopId={shopId} />
        </QueryBoundary>
    )
}

function ShopBarErrorFallback({ error, reset }: { error: unknown; reset: () => void }) {
    const { locale } = useI18n()
    const t = useT()
    return (
        <ShopBarError
            message={errorText(toApiError(error), locale, t("common.loadFailed.shopBar"))}
            onRetry={reset}
        />
    )
}

function ShopBarContent({ shopId }: { shopId: string }) {
    const shop = useSuspenseQuery(shopOptions(shopId)).data
    const t = useT("product")
    const logoSrc = shop.logoKey ? imgUrl(shop.logoKey) : ""

    return (
        <div className="flex h-full items-center gap-3">
            <Avatar
                size="xl"
                shape="square"
            >
                {logoSrc && (
                    <AvatarImage
                        src={logoSrc}
                        alt={shop.name}
                    />
                )}
                <AvatarFallback className="font-bold">{avatarInitial(shop.name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                className="flex items-center gap-0.5 text-lg font-bold text-foreground transition-colors hover:text-primary"
                            >
                                <span className="truncate">{shop.name}</span>
                            </button>
                        }
                    />
                    <TooltipContent>{shop.name}</TooltipContent>
                </Tooltip>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant="outline"
                    shape="pill"
                    onClick={() => notify.info(message("product.soon.support"))}
                >
                    <Headphones />
                    {t("product.detail.shop.service")}
                </Button>
                <ShopCouponPopover shopId={shopId} />
                <Button
                    variant="outline"
                    shape="pill"
                    onClick={() => notify.info(message("product.soon.shopHome"))}
                >
                    <Store />
                    {t("product.detail.shop.enter")}
                </Button>
            </div>
        </div>
    )
}
