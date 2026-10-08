import { Link } from "@tanstack/react-router"

import { Logo, SearchBar } from "@shop/ui-web"

import { useSearchNavigate } from "#/shared/lib/search"
import { useT } from "#/locales/use-t"

/** 首页第一层：sticky 顶栏，左侧 logo，中间大搜索框。
 *  高度吃 --home-header-height token（styles.css），推荐条吸顶的 top 偏移同源，
 *  不再用 TS 常量做跨组件耦合 */
export function HomeHeader() {
    const runSearch = useSearchNavigate()
    const t = useT()

    return (
        <div className="sticky top-0 z-30">
            <header className="h-(--home-header-height) border-b border-border/60 bg-background/95 backdrop-blur">
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
