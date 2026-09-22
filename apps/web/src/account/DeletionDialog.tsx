import { z } from "zod"

import { useCountdown } from "@shop/app-kit"
import { ErrorCodes, toApiError } from "@shop/common"
import { AccountDeletionApi } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    FieldError,
    FieldLabel,
    FormError,
    InputGroup,
    InputGroupButton,
    InputGroupInput,
    Spinner,
    useAppForm,
} from "@shop/ui-web"
import { useMutation } from "@tanstack/react-query"
import { useId, useState } from "react"

import { deletionKeys } from "./queries"

/**
 * 注销账号弹窗：数据处置清单 → 手机验证码 → 毁灭性确认，三件事在同一个弹窗里按顺序做完。
 *
 * 把「会丢掉什么」写在提交前而不是成功后：个保法第 47 条要的是知情删除，事后一份清单等于没告知。
 * 三档口径（清空 / 匿名保留 / 法定留存）与后端 ACC-76 的处置一致，改后端要同步这里。
 *
 * 验证码发给账号绑定的号码（号码由后端从 token 取，前端不报号），所以没有手机号输入框；
 * 提交后进的是冷静期而不是立刻删除，撤销入口在安全设置页那张卡上。
 */

/** 冷静期天数，与后端 AccountDeletionTimeouts.COOLING_OFF 同值（只用于文案；确切生效时刻由接口给） */
const COOLING_OFF_DAYS = 15

const CodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "验证码为 6 位数字") })

/** 三档处置：标题就是「你能拿回什么」，所以按不可逆程度从重到轻排 */
const DISPOSITIONS: { title: string; items: string; tone: "lost" | "kept" | "legal" }[] = [
    { title: "会清空", items: "购物车、收藏、收货地址、未使用的优惠券", tone: "lost" },
    {
        title: "会匿名保留",
        items: "账号本身（昵称改成「已注销用户」、手机号与密码清掉）、你名下的店铺停止营业",
        tone: "kept",
    },
    {
        title: "会依法留存",
        items: "订单、退款与售后记录、支付流水——交易记录另有法定留存义务，注销抹的是身份，不是账",
        tone: "legal",
    },
]

const TONE_CLASS = {
    lost: "text-destructive",
    kept: "text-foreground",
    legal: "text-muted-foreground",
} as const

/** 验证码类错误要标红输入框（ACC-67），其余错误只在表单下方说一句 */
const CODE_ERROR_CODES = new Set<string>([ErrorCodes.SMS_CODE_INVALID, ErrorCodes.SMS_CODE_EXPIRED])

export interface DeletionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function DeletionDialog({ open, onOpenChange }: DeletionDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <DeletionForm onOpenChange={onOpenChange} />
            </DialogContent>
        </Dialog>
    )
}

function DeletionForm({ onOpenChange }: Pick<DeletionDialogProps, "onOpenChange">) {
    const codeId = useId()
    const [countdown, setCountdown] = useCountdown()
    const [error, setError] = useState<string | undefined>()
    const [codeInvalid, setCodeInvalid] = useState(false)

    // 发码是纯命令（没有 query 缓存要动），但要读错误码决定「429 也起倒计时」，故与提交共用一套本地错误态
    const send = useMutation({
        mutationFn: () => AccountDeletionApi.sendDeletionCode(),
        meta: { silentError: true },
        onSuccess: () => setCountdown(60),
        onError: (e) => {
            const err = toApiError(e)
            // 429 的窗口就是 60s，连点只会再撞一次限流：倒计时无损失地兜住（与登录发码同一处理，ACC-67）
            if (err.status === 429) setCountdown(60)
            setError(err.detail)
        },
    })

    const request = useMutation({
        mutationFn: (code: string) => AccountDeletionApi.requestDeletion({ body: { code } }),
        meta: {
            success: `注销申请已提交，${COOLING_OFF_DAYS} 天内可撤销`,
            silentError: true,
            invalidates: [deletionKeys.all],
        },
        onSuccess: () => onOpenChange(false),
        onError: (e) => {
            const err = toApiError(e)
            setCodeInvalid(CODE_ERROR_CODES.has(String(err.code)))
            setError(err.detail)
        },
    })

    const form = useAppForm({
        defaultValues: { code: "" },
        validators: { onSubmit: CodeSchema },
        onSubmit: ({ value }) => {
            request.mutate(CodeSchema.parse(value).code)
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>注销账号</DialogTitle>
                <DialogDescription>
                    提交后进入 {COOLING_OFF_DAYS}{" "}
                    天冷静期：期内账号照常可用，随时可以撤销；期满才会执行，届时无法恢复。
                </DialogDescription>
            </DialogHeader>

            <dl className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
                {DISPOSITIONS.map((d) => (
                    <div
                        key={d.title}
                        className="flex gap-3 text-sm"
                    >
                        <dt className={`w-20 shrink-0 font-medium ${TONE_CLASS[d.tone]}`}>
                            {d.title}
                        </dt>
                        <dd className="text-muted-foreground">{d.items}</dd>
                    </div>
                ))}
            </dl>

            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <form.AppField name="code">
                    {(field) => (
                        <Field>
                            <FieldLabel
                                htmlFor={codeId}
                                required
                            >
                                短信验证码
                            </FieldLabel>
                            <InputGroup invalid={codeInvalid}>
                                <InputGroupInput
                                    id={codeId}
                                    aria-label="短信验证码"
                                    aria-invalid={codeInvalid}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    placeholder="6 位数字"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => {
                                        field.handleChange(e.target.value.replaceAll(/\D/g, ""))
                                        // 重新输入即清验证码错误（标红随之消失），其余错误留到下次提交
                                        setCodeInvalid(false)
                                        setError(undefined)
                                    }}
                                />
                                <InputGroupButton
                                    variant="link"
                                    size="sm"
                                    className="h-full shrink-0"
                                    disabled={countdown > 0 || send.isPending}
                                    onClick={() => send.mutate()}
                                >
                                    {countdown > 0 ? (
                                        <span className="tabular-nums">{countdown}s 后重发</span>
                                    ) : send.isPending ? (
                                        <Spinner />
                                    ) : (
                                        "获取验证码"
                                    )}
                                </InputGroupButton>
                            </InputGroup>
                            <FieldError errors={field.state.meta.errors} />
                        </Field>
                    )}
                </form.AppField>

                <FormError>{error}</FormError>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button
                        type="submit"
                        variant="destructive"
                        disabled={request.isPending}
                    >
                        {request.isPending && <Spinner />}提交注销申请
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}
