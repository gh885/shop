import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { notify } from "@shop/app-kit/data"
import { SearchHeader } from "#/shared/ui/SearchHeader"
import { DETAIL_LAYOUT } from "./constants"

/**
 * 详情页顶栏（非吸顶，随页面滚走）：通用 SearchHeader + 详情页专属的「搜本店」。
 * 容器类与页面正文同源（`DETAIL_LAYOUT.container`），所以 logo / 搜索框与正文左右对齐。
 * 店内搜索后端未建，先 toast 占位。
 */
export function DetailHeader() {
    const t = useT("product")
    return (
        <SearchHeader
            containerClassName={DETAIL_LAYOUT.container}
            extra={
                <button
                    type="button"
                    onClick={() => notify.info(message("web.product.soon.inShopSearch"))}
                    className="h-full shrink-0 bg-primary/10 px-4 text-sm font-medium text-primary-subtle-foreground transition-colors hover:bg-primary/20"
                >
                    {t("web.product.detail.searchShop")}
                </button>
            }
        />
    )
}
