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

import { notify } from "#/shared/lib/toast"

import { useShop } from "./use-product-detail"

/** 详情页顶部店铺条：头像 + 店名，右侧客服/进店（对齐参考图第一行） */
export function ShopBar({ shopId }: { shopId: string }) {
    const shop = useShop(shopId)

    return (
        <div className="flex items-center gap-3">
            {/* 头像：logoKey 是对象存储 key 而非 URL（见 V8 迁移注释），当前数据无 CDN 基址，
                仅在 key 本身是 http(s) 地址时传 AvatarImage，否则回退店名首字 */}
            <Avatar className="size-12 rounded-lg">
                {shop?.logoKey?.startsWith("http") && (
                    <AvatarImage
                        src={shop.logoKey}
                        alt={shop.name}
                    />
                )}
                <AvatarFallback className="rounded-lg bg-sunken text-lg font-bold text-muted-foreground">
                    {shop?.name?.charAt(0) ?? "店"}
                </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                className="flex items-center gap-0.5 text-lg font-bold text-foreground transition-colors hover:text-primary"
                            >
                                <span className="truncate">{shop?.name ?? "…"}</span>
                            </button>
                        }
                    />
                    <TooltipContent>{shop?.name}</TooltipContent>
                </Tooltip>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant="outline"
                    className="gap-1 rounded-full"
                    onClick={() => notify.info("客服功能即将上线")}
                >
                    <Headphones />
                    客服
                </Button>
                <Button
                    variant="outline"
                    className="gap-1 rounded-full"
                    onClick={() => notify.info("店铺主页即将上线")}
                >
                    <Store />
                    进店
                </Button>
            </div>
        </div>
    )
}
