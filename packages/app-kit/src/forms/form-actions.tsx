import { Button, DialogFooter, Spinner } from "@shop/ui-web"

import type { SharedTranslate } from "@shop/i18n"

import { useTypedT } from "../i18n"

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
    const t = useTypedT<SharedTranslate>()
    return (
        <DialogFooter>
            <Button
                type="button"
                variant="outline"
                disabled={disableCancel}
                onClick={onCancel}
            >
                {cancelLabel ?? t("confirm.cancel")}
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
