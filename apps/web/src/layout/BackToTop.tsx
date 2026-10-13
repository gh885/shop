import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

import { Button } from "@shop/ui-web"
import { scrollToTop } from "@shop/common/domain" /** 滚动超过一屏后在右下角出现「回顶部」按钮 */
import { useT } from "#/locales/use-t"
export function BackToTop() {
    const t = useT("common")
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        function onScroll() {
            setVisible(window.scrollY > window.innerHeight)
        }
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    if (!visible) return

    return (
        <Button
            variant="outline"
            size="icon"
            shape="pill"
            aria-label={t("common.a11y.backToTop")}
            className="fixed bottom-6 right-6 z-chrome"
            onClick={scrollToTop}
        >
            <ArrowUp />
        </Button>
    )
}
