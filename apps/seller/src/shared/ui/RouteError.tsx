import { Link, type ErrorComponentProps } from "@tanstack/react-router"

import { Button } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { RouteErrorFallback } from "@shop/app-kit/shell" /**
 * seller 的路由级错误页：挂在 `createRouter({ defaultErrorComponent })` 上，每个 route match
 * 失败都在自己的位置渲染 —— 叶子路由失败时工作台侧边栏/顶栏仍在，不再整页白屏。
 * 端级差异只有「回到工作台」这个次要出口；重试的官方双 reset 接线在 `RouteErrorFallback` 里。
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
    const t = useT()
    return (
        <RouteErrorFallback
            error={error}
            reset={reset}
            secondaryAction={
                <Button
                    variant="outline"
                    render={
                        <Link
                            to="/product/list"
                            search={{ page: 1, size: 10 }}
                        />
                    }
                >
                    {t("common.action.backHome")}
                </Button>
            }
        />
    )
}
