import { message } from "#/locales/message"
import { useNavigate } from "@tanstack/react-router"

import { notify } from "@shop/app-kit/data"

export function useSearchNavigate() {
    const navigate = useNavigate()

    return (keyword: string) => {
        const q = keyword.trim()
        if (!q) {
            notify.info(message("search.needKeyword"))
            return
        }
        void navigate({ to: "/search", search: { q } })
    }
}
