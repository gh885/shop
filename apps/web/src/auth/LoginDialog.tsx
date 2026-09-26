import { LoginForm, useT } from "@shop/app-kit"
import { Dialog, DialogContent, DialogTitle } from "@shop/ui-web"
import { QrCode } from "lucide-react"

import { getCaptcha, loginByPassword, loginBySms, sendSmsCode } from "./actions"

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * 全局登录弹窗：壳（Dialog + 扫码占位 + 协议文案）+ app-kit 的 LoginForm。
 * 表单交互（Tab/验证码/倒计时/错误态）一律在 LoginForm 里，这里只做装配与收尾。
 */
export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const t = useT()
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* 自定义排版：内边距与节奏由下面那层 p-8 的容器自己管（rounded-xl 与基类同值，不必再写） */}
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
                {/* 顶部品牌色环境光，打破纯平 */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-primary/8 to-transparent" />

                <div className="relative flex flex-col gap-7 p-8 pt-7">
                    <DialogTitle className="text-center">{t("web.login.title")}</DialogTitle>

                    <div className="flex items-stretch gap-8">
                        <ScanPlaceholder />
                        {/* 两栏分割线：两端渐隐，弱化存在感 */}
                        <div className="hidden w-px bg-linear-to-b from-transparent via-foreground/10 to-transparent sm:block" />

                        <LoginForm
                            active={open}
                            getCaptcha={getCaptcha}
                            sendCode={(input) => sendSmsCode(input.phone, input)}
                            submit={(v) =>
                                v.tab === "sms"
                                    ? loginBySms(v.phone, v.code)
                                    : loginByPassword(v.phone, v.password)
                            }
                            onSuccess={() => onOpenChange(false)}
                            footer={
                                <p className="text-center text-xs text-muted-foreground">
                                    {t("web.login.agreementPrefix")}
                                    {/* 协议/政策暂无落地路由：渲染为不可聚焦的纯文本，避免死按钮 */}
                                    <span className="mx-1 text-foreground">
                                        {t("web.login.userAgreement")}
                                    </span>
                                    {t("web.login.and")}
                                    <span className="mx-1 text-foreground">
                                        {t("web.login.privacy")}
                                    </span>
                                </p>
                            }
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/** 扫码登录占位（后端未支持，仅 UI 预留） */
function ScanPlaceholder() {
    const t = useT()
    return (
        <div className="hidden w-56 flex-col items-center justify-center gap-4 sm:flex">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{t("web.login.qrTitle")}</p>
                <span className="rounded bg-accent px-1.5 py-0.5 text-3xs font-medium text-accent-foreground">
                    {t("web.login.qrComing")}
                </span>
            </div>
            <div className="relative flex size-44 items-center justify-center rounded-lg bg-muted/70">
                {/* 扫码框四角标记 */}
                <span className="absolute left-0 top-0 size-4 rounded-tl-md border-l-2 border-t-2 border-foreground/30" />
                <span className="absolute right-0 top-0 size-4 rounded-tr-md border-r-2 border-t-2 border-foreground/30" />
                <span className="absolute bottom-0 left-0 size-4 rounded-bl-md border-b-2 border-l-2 border-foreground/30" />
                <span className="absolute right-0 bottom-0 size-4 rounded-br-md border-b-2 border-r-2 border-foreground/30" />
                <QrCode
                    className="size-20 text-muted-foreground/50"
                    strokeWidth={1.25}
                />
            </div>
            <p className="text-xs text-muted-foreground">{t("web.login.qrHint")}</p>
        </div>
    )
}
