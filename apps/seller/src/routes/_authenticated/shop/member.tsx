import { createFileRoute } from "@tanstack/react-router"

import { PlaceholderPage } from "#/shared/ui/PlaceholderPage"
import { MemberPage } from "#/domains/shop/MemberPage"
import { useMe } from "#/shared/lib/me"
import { useT } from "#/locales/use-t"

export const Route = createFileRoute("/_authenticated/shop/member")({
    component: MemberRoute,
})

/** 子账号管理是主账号专属：身份未到先挡一层（端点层另有 SELLER_STAFF_MANAGE + 主账号复核） */
function MemberRoute() {
    const t = useT()
    const me = useMe()
    if (me.data && !me.data.isPrimary) {
        return <PlaceholderPage title={t("shop.member.primaryOnly")} />
    }
    return <MemberPage />
}
