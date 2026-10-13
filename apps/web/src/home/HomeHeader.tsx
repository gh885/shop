import { Link } from "@tanstack/react-router"

import { Logo, SearchBar } from "@shop/ui-web"

import { useSearchNavigate } from "#/shared/lib/search"
import { useT } from "#/locales/use-t"

/** 首页第一层：sticky 顶栏，左侧 logo，中间大搜索框。
 *  高度吃 --home-header-height token（styles.css），推荐条吸顶的 top 偏移同源，
 *  不再用 TS 常量做跨组件耦合。
 *  表面与上方 SiteHeader / 下方 RecommendBar 同为不透明白（bg-background）：
 *  天猫式顶栏三节一色，滚动时内容整体被盖住，不做半透明白 / 灰混搭。
 *
 *  层叠用 **壳层档 z-chrome**（不是内容吸顶 z-sticky）：它是本页最高的吸顶条，
 *  必须压过内容浮层——分类导航的竖展面板（z-raised）滚动时要能从它底下过，
 *  否则面板会盖住 logo。三者先后严格：推荐条 z-sticky(30) < 面板 z-raised(35) < 本顶栏(40)。 */
export function HomeHeader() {
    const runSearch = useSearchNavigate()
    const t = useT()

    return (
        <div className="sticky top-0 z-chrome">
            <header className="h-(--home-header-height) border-b border-border/60 bg-background">
                <div className="mx-auto flex h-full w-full max-w-page items-center gap-4 px-6 sm:gap-8">
                    <Link
                        to="/"
                        className="shrink-0"
                        aria-label={t("common.a11y.home")}
                    >
                        <Logo size={36} />
                    </Link>

                    <div className="mx-auto min-w-0 w-full max-w-3xl flex-1">
                        <SearchBar
                            size="lg"
                            placeholder={t("search.input.placeholder")}
                            onSearch={runSearch}
                        />
                    </div>
                </div>
            </header>
        </div>
    )
}
