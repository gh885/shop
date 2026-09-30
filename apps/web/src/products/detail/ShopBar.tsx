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

import { errorText, notify, QueryBoundary, useI18n } from "@shop/app-kit"
import { toApiError } from "@shop/common"

import { useT } from "#/locales/use-t"

import { ShopCouponPopover } from "#/coupon"
import { avatarInitial } from "#/shared/lib/avatar"

import { ShopBarError, ShopBarSkeleton } from "./ShopBarStates"
import { shopOptions } from "./queries"

/**
 * 详情页顶部店铺条：头像 + 店名，右侧客服/进店（对齐参考图第一行）。
 *
 * 三态交给框架：挂起 → `pending` 同形骨架；失败 → 块级错误 + 重试（官方 reset 链路）；
 * 成功 → 内容（其中「no logo」是成功态下的展示降级，退店名首字字母头像）。
 * 店条是**区块**（详情失败才致命，店条失败只该影响这一条），所以用 `QueryBoundary` 而不是路由错误页。
 */
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

/** 失败态：组件而非渲染函数，locale 与本端 catalog 要靠 hook 取（Feed 同款理由） */
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

    return (
        <div className="flex h-full items-center gap-3">
            {/* 头像：logoKey 是对象存储 key 而非 URL（见 V8 迁移注释），当前数据无 CDN 基址，
                仅在 key 本身是 http(s) 地址时传 AvatarImage，否则回退店名首字 */}
            <Avatar
                size="xl"
                shape="square"
            >
                {shop.logoKey?.startsWith("http") && (
                    <AvatarImage
                        src={shop.logoKey}
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
                    onClick={() => notify.info("客服功能即将上线")}
                >
                    <Headphones />
                    客服
                </Button>
                {/* 领券入口：该店没有可领券时整块不渲染（空浮层比没有入口更困惑） */}
                <ShopCouponPopover shopId={shopId} />
                <Button
                    variant="outline"
                    shape="pill"
                    onClick={() => notify.info("店铺主页即将上线")}
                >
                    <Store />
                    进店
                </Button>
            </div>
        </div>
    )
}
