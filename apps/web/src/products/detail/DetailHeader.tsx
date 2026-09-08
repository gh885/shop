import { notify } from "@shop/app-kit"
import { SearchHeader } from "#/shared/ui/SearchHeader"

/**
 * 详情页版心容器：内容宽 1486（= --container-page）+ 左右 24px 内边距。
 * 详情页要按天猫的三块宽度排（左栏 844 + 间距 48 + 右栏 594 = 1486），
 * 主版心的 max-w-(--container-page) 被 px-6 吃掉 48px 只剩 1438，所以这里放宽外层。
 * 顶栏用同一个类，保证 logo / 搜索框与页面内容左右对齐。
 */
export const DETAIL_CONTAINER_CLASS = "max-w-[calc(var(--container-page)_+_3rem)]"

/**
 * 详情页顶栏（非吸顶，随页面滚走）：通用 SearchHeader + 详情页专属的「搜本店」。
 * 店内搜索后端未建，先 toast 占位。
 */
export function DetailHeader() {
    return (
        <SearchHeader
            className="border-b border-border/60"
            containerClassName={DETAIL_CONTAINER_CLASS}
            extra={
                <button
                    type="button"
                    onClick={() => notify.info("店内搜索即将上线")}
                    className="h-full shrink-0 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                    搜本店
                </button>
            }
        />
    )
}
