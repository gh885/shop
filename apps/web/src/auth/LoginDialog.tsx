import { LoginForm } from "@shop/app-kit/auth"
import { Button, Dialog, DialogClose, DialogContent, DialogTitle } from "@shop/ui-web"
import { QrCode, XIcon } from "lucide-react"

import { useT } from "#/locales/use-t"
import { getCaptcha, loginByPassword, loginBySms, sendSmsCode } from "./actions"

interface LoginDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * 全局登录弹窗：壳（Dialog + 门头遮阳篷 + 左侧扫码占位 + 协议文案）+ app-kit 的 LoginForm。
 * 表单交互（Tab/验证码/倒计时/错误态）一律在 LoginForm 里，这里只做装配与收尾。
 */
export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
    const t = useT()
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* 自定义排版：内边距与节奏由下面那层容器自己管（rounded-xl 与基类同值，不必再写）。
                只裁横向：前倾的篷布下缘比弹窗略宽；纵向保留壳自带的 overflow-y-auto，矮屏还能滚到底。
                关闭按钮自己摆（默认那颗是透明底，会糊在篷布条纹上），且必须排到最后一个子节点：
                同层定位元素按文档顺序决定谁压谁，柜台容器是 relative、写在按钮前面，不排到末尾
                会被它盖住——看着按钮在那儿，点下去命中的是柜台容器，点了没反应 */}
            <DialogContent
                showCloseButton={false}
                className="gap-0 overflow-x-hidden p-0 sm:max-w-2xl"
            >
                {/* 顶部品牌色环境光，打破纯平（也是篷布底下那片阴凉） */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-primary/8 to-transparent" />
                <div
                    aria-hidden
                    className="storefront-awning"
                />

                {/* 柜台：pt-24 让开篷布下缘与它的投影（篷布落到 ~69px，留 27px 喘气），
                    pb-10 刻意比常规内边距大一号——底边是视觉收口，留得住才不像被切了一刀。
                    纵向 overflow 仍由壳自带，矮屏能滚到底 */}
                <div className="login-rise relative flex flex-col gap-6 px-8 pt-24 pb-10">
                    <DialogTitle className="sr-only">{t("web.login.title")}</DialogTitle>

                    <div className="flex items-stretch gap-6">
                        <ScanPlaceholder />
                        {/* 两栏分割线：两端渐隐，弱化存在感 */}
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
                                    <p>{t("web.login.autoRegister")}</p>
                                    <p>
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
                    <span className="sr-only">{t("web.login.close")}</span>
                </DialogClose>
            </DialogContent>
        </Dialog>
    )
}

/** 扫码登录占位（后端未支持，仅 UI 预留）。
    顶底都贴住右栏：标题行 h-8 与 TabsList 同高（文字自然落在一条线上），提示文字落到底与脚注
    同一收口线。以前靠 `justify-between` 把多出的高度均分成上下两段空隙撑开——两段各 100px 出头，
    「扫码登录」底下像悬着一大片空白，两栏看着也不像一件事。
    现在让 QR 面板自己吃掉这段高度（flex-1 + min-h-48 兜底），标题与提示之间只留固定 24px：
    多余空间变成面板本身（本来就是「扫码区」），左右两侧也就齐平了 */
function ScanPlaceholder() {
    const t = useT()
    return (
        <div className="hidden w-56 flex-col sm:flex">
            <div className="flex h-8 items-center gap-2">
                <p className="text-sm font-medium">{t("web.login.qrTitle")}</p>
                <span className="rounded bg-accent px-1.5 py-0.5 text-3xs font-medium text-accent-foreground">
                    {t("web.login.qrComing")}
                </span>
            </div>
            <div className="relative mt-6 flex min-h-48 flex-1 items-center justify-center rounded-lg bg-muted">
                {/* 扫码框四角标记 */}
                <span className="absolute left-0 top-0 size-4 rounded-tl-md border-l-2 border-t-2 border-foreground/30" />
                <span className="absolute right-0 top-0 size-4 rounded-tr-md border-r-2 border-t-2 border-foreground/30" />
                <span className="absolute bottom-0 left-0 size-4 rounded-bl-md border-b-2 border-l-2 border-foreground/30" />
                <span className="absolute right-0 bottom-0 size-4 rounded-br-md border-b-2 border-r-2 border-foreground/30" />
                <QrCode
                    className="size-24 text-muted-foreground/50"
                    strokeWidth={1.25}
                />
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
                {t("web.login.qrHint")}
            </p>
        </div>
    )
}
