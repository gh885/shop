import { LocaleSwitcher } from "@shop/app-kit/i18n"
import { LoginForm } from "@shop/app-kit/auth"
import { Button, Dialog, DialogClose, DialogContent, DialogTitle } from "@shop/ui-web"
import { QrCode, XIcon } from "lucide-react"

import { useT } from "#/locales/use-t"
import { getCaptcha, loginByPassword, loginBySms, sendSmsCode } from "./actions"

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const t = useT()
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent
                showCloseButton={false}
                className="gap-0 overflow-x-hidden p-0 sm:max-w-2xl"
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-primary/8 to-transparent" />
                <div
                    aria-hidden
                    className="storefront-awning"
                />

                <div className="login-rise relative flex flex-col gap-6 px-8 pt-24 pb-10">
                    <DialogTitle className="sr-only">{t("login.title")}</DialogTitle>

                    <div className="flex items-stretch gap-6">
                        <ScanPlaceholder />
                        <div className="hidden w-px self-stretch bg-linear-to-b from-transparent via-foreground/10 to-transparent sm:block" />

                        <LoginForm
                            getCaptcha={getCaptcha}
                            sendCode={(input) => sendSmsCode(input.phone, input)}
                            submit={(v) =>
                                v.tab === "sms"
                                    ? loginBySms(v.phone, v.code)
                                    : loginByPassword(v.phone, v.password)
                            }
                            onSuccess={() => onOpenChange(false)}
                            footer={
                                <div className="flex flex-col gap-1 text-center text-xs text-muted-foreground">
                                    <div className="flex justify-center">
                                        <LocaleSwitcher />
                                    </div>
                                    <p>{t("login.autoRegister")}</p>
                                    <p>
                                        {t("login.agreementPrefix")}
                                        <span className="mx-1 text-foreground">
                                            {t("login.userAgreement")}
                                        </span>
                                        {t("login.and")}
                                        <span className="mx-1 text-foreground">
                                            {t("login.privacy")}
                                        </span>
                                    </p>
                                </div>
                            }
                        />
                    </div>
                </div>

                <DialogClose
                    render={
                        <Button
                            variant="outline"
                            size="icon-sm"
                            shape="pill"
                            className="absolute top-3 right-3"
                        />
                    }
                >
                    <XIcon />
                    <span className="sr-only">{t("login.close")}</span>
                </DialogClose>
            </DialogContent>
        </Dialog>
    )
}

function ScanPlaceholder() {
    const t = useT()
    return (
        <div className="hidden w-56 flex-col sm:flex">
            <div className="flex h-8 items-center gap-2">
                <p className="text-sm font-medium">{t("login.qrTitle")}</p>
                <span className="rounded bg-accent px-1.5 py-0.5 text-3xs font-medium text-accent-foreground">
                    {t("login.qrComing")}
                </span>
            </div>
            <div className="relative mt-6 flex min-h-48 flex-1 items-center justify-center rounded-lg bg-muted">
                <span className="absolute left-0 top-0 size-4 rounded-tl-md border-l-2 border-t-2 border-foreground/30" />
                <span className="absolute right-0 top-0 size-4 rounded-tr-md border-r-2 border-t-2 border-foreground/30" />
                <span className="absolute bottom-0 left-0 size-4 rounded-bl-md border-b-2 border-l-2 border-foreground/30" />
                <span className="absolute right-0 bottom-0 size-4 rounded-br-md border-b-2 border-r-2 border-foreground/30" />
                <QrCode
                    className="size-24 text-muted-foreground/50"
                    strokeWidth={1.25}
                />
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">{t("login.qrHint")}</p>
        </div>
    )
}
