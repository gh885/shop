import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

import { Button } from "@shop/ui-web"
import { scrollToTop } from "@shop/common/domain" /** 滚动超过一屏后在右下角出现「回顶部」按钮 */
export function BackToTop() {
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
            aria-label="回到顶部"
            className="fixed bottom-6 right-6 z-40"
            onClick={scrollToTop}
        >
            <ArrowUp />
        </Button>
    )
}
