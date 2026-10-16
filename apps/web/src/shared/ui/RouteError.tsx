import { Link, type ErrorComponentProps } from "@tanstack/react-router"

import { Button } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { RouteErrorFallback } from "@shop/app-kit/shell"

export function RouteError({ error, reset }: ErrorComponentProps) {
    const t = useT()
    return (
        <RouteErrorFallback
            error={error}
            reset={reset}
            secondaryAction={
                <Button
                    variant="outline"
                    render={<Link to="/" />}
                >
                    {t("common.action.backHome")}
                </Button>
            }
        />
    )
}
