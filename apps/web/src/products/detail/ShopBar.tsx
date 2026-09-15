import { Headphones, Store } from "lucide-react"

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@shop/ui-web"

import { notify } from "@shop/app-kit"
import { toApiError } from "@shop/common"

import { ShopCouponPopover } from "#/coupon"

import { ShopBarError, ShopBarSkeleton } from "./ShopBarStates"
import { useShopQuery } from "./queries"

/**
 * 详情页顶部店铺条：头像 + 店名，右侧客服/进店（对齐参考图第一行）。
 *
 * 三态在这里收敛（见 ShopBarStates.tsx）：失败 → 内联错误 + 重试；未就绪 → 同形骨架；
 * 成功 → 内容（其中「no logo」是成功态下的展示降级，退店名首字字母头像）。
 */
export function ShopBar({ shopId }: { shopId: string }) {
    const { data: shop, isError, error, refetch, isFetching } = useShopQuery(shopId)

    // 先判失败：失败时 data 可能为空，落到下面的骨架分支就永远转下去了（这是本次要修的坑）
    if (isError) {
        return (
            <ShopBarError
                message={toApiError(error).detail || "店铺信息加载失败"}
                onRetry={() => void refetch()}
                retrying={isFetching}
            />
        )
    }

    if (!shop) return <ShopBarSkeleton />

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
                <AvatarFallback className="font-bold">{shop.name.charAt(0)}</AvatarFallback>
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
