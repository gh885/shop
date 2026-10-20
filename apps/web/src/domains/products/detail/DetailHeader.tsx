import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { notify } from "@shop/app-kit/data"
import { SearchHeader } from "#/shared/ui/SearchHeader"
import { DETAIL_LAYOUT } from "./constants"

export function DetailHeader() {
    const t = useT("product")
    return (
        <SearchHeader
            containerClassName={DETAIL_LAYOUT.container}
            extra={
                <button
                    type="button"
                    onClick={() => notify.info(message("product.soon.inShopSearch"))}
                    className="h-full shrink-0 bg-primary/10 px-4 text-sm font-medium text-primary-subtle-foreground transition-colors hover:bg-primary/20"
                >
                    {t("product.detail.searchShop")}
                </button>
            }
        />
    )
}
