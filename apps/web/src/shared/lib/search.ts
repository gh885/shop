import { message } from "#/locales/message"
import { useNavigate } from "@tanstack/react-router"

import { notify } from "@shop/app-kit/data" /**
 * 首页大搜索框与内页顶栏共用的搜索跳转。
 *
 * 搜索后端已由 `GET /api/products` 承接；这里只负责把用户输入送进统一结果页，
 * 空输入沿用原有反馈，不把空关键词变成「全站列表」。
 */
export function useSearchNavigate() {
    const navigate = useNavigate()

    return (keyword: string) => {
        const q = keyword.trim()
        if (!q) {
            notify.info(message("web.search.needKeyword"))
            return
        }
        void navigate({ to: "/search", search: { q } })
    }
}
