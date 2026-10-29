import { Link } from "@tanstack/react-router"

import { Logo, SearchBar } from "@shop/ui-web"

import { useNavigate } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"

export function HomeHeader() {
    const navigate = useNavigate()
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
                            onSearch={(query) =>
                                void navigate({ to: "/", search: { q: query || undefined } })
                            }
                        />
                    </div>
                </div>
            </header>
        </div>
    )
}
