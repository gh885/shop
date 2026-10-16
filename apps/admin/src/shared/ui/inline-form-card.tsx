import type { ReactNode } from "react"

import { submitForm } from "@shop/app-kit/forms"

export function InlineFormCard({
    className,
    form,
    children,
}: {
    className: string
    form: Parameters<typeof submitForm>[0]
    children: ReactNode
}) {
    return (
        <form
            className={className}
            onSubmit={(event) => {
                event.preventDefault()
                void submitForm(form)
            }}
        >
            {children}
        </form>
    )
}
