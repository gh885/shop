import { Link } from "@tanstack/react-router"

import { useT } from "#/locales/use-t"
import { isExternalTarget } from "#/shared/lib/external"

import { FOOTER_GROUPS } from "./constants"

/** 站点页脚：品牌 + 真实导航路径，不放死链 */
export function SiteFooter() {
    const t = useT("footer")
    return (
        <footer className="border-t border-border">
            <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-10 md:flex-row md:justify-between">
                <div className="space-y-2">
                    <p className="text-sm font-semibold">{t("footer.brand")}</p>
                    <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
                </div>

                <div className="flex gap-16">
                    {FOOTER_GROUPS.map((group) => (
                        <div
                            key={group.titleKey}
                            className="space-y-3"
                        >
                            <p className="text-sm font-medium">{t(group.titleKey)}</p>
                            <ul className="space-y-2">
                                {group.links.map((link) => (
                                    <li key={link.labelKey}>
                                        {isExternalTarget(link.to) ? (
                                            <a
                                                href={link.to}
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {t(link.labelKey)}
                                            </a>
                                        ) : (
                                            <Link
                                                to={
                                                    link.to === "/" || link.to === "/sell"
                                                        ? link.to
                                                        : "/"
                                                }
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {t(link.labelKey)}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-border">
                <p className="mx-auto w-full max-w-page px-4 py-4 text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Shop
                </p>
            </div>
        </footer>
    )
}
