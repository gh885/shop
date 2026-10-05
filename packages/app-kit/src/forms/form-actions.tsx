import { Button, DialogFooter, Spinner } from "@shop/ui-web"

import { useT } from "../i18n"

export function FormActions({
    pending = false,
    destructive = false,
    disableCancel = false,
    cancelLabel,
    submitLabel,
    onCancel,
}: {
    pending?: boolean
    destructive?: boolean
    disableCancel?: boolean
    cancelLabel?: string
    submitLabel: string
    onCancel: () => void
}) {
    const t = useT()
    return (
        <DialogFooter>
            <Button
                type="button"
                variant="outline"
                disabled={disableCancel}
                onClick={onCancel}
            >
                {cancelLabel ?? t("appKit.confirm.cancel")}
            </Button>
            <Button
                type="submit"
                variant={destructive ? "destructive" : undefined}
                disabled={pending}
            >
                {pending && <Spinner />}
                {submitLabel}
            </Button>
        </DialogFooter>
    )
}
