import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, KeyRound, ShieldCheck, Store, Trash2, UserPlus } from "lucide-react"

import { ShopsApi, type SubaccountItem } from "@shop/api/sdk"
import { PASSWORD_MIN, PHONE_DIGITS, SubmitButton, TextField } from "@shop/app-kit/auth"
import { formatDate } from "@shop/app-kit/display"
import { serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import {
    applyServerFieldErrors,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    MaskedValueCell,
    Skeleton,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    confirm,
    useAppForm,
} from "@shop/ui-web"

import { message } from "#/locales/message"
import { useT } from "#/locales/use-t"
import { shopKeys, subaccountsOptions, useShop } from "#/shop"
import {
    CreateSubaccountFormSchema,
    ResetSubaccountPasswordFormSchema,
    SUBACCOUNT_LOGIN_NAME_MAX,
    SUBACCOUNT_PERMISSIONS,
    SUBACCOUNT_PERMISSION_LABEL,
    SUBACCOUNT_STATUS_META,
    subaccountPermissionLabel,
    type SubaccountPermission,
} from "#/shop/subaccount"

export const Route = createFileRoute("/_app/shop/member")({
    component: SubaccountsPage,
})

/**
 * 子账号管理（店主专属）：列表 + 新建 + 行内四类动作（停用/启用、重置口令、改权限、移除）。
 *
 * 路由路径保留 `/shop/member`（侧栏那一项也在同一个位置），但页面语义完全换了：
 * 旧模型是「成员 + 邀请」，新模型是「店主给这家店开一个自带凭证的登录身份」——
 * 子账号有自己的登录名与口令，激活后自带店铺，不是被邀请进店的买家账号。
 */
function SubaccountsPage() {
    const shop = useShop()
    const t = useT("shop")

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6">
            <div>
                <h1 className="text-xl font-bold">{t("shop.subaccount.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t("shop.subaccount.subtitle", { name: shop.name })}
                </p>
            </div>
            <NewSubaccountCard shopId={shop.id} />
            <SubaccountList shopId={shop.id} />
        </div>
    )
}

/** 权限勾选组：码值与本文件之外的中文标签都来自 `#/shop/subaccount`，这里只画格子 */
function PermissionPicker({
    value,
    onToggle,
    legend,
}: {
    value: readonly string[]
    onToggle: (code: SubaccountPermission, checked: boolean) => void
    legend: string
}) {
    const t = useT("shop")
    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{legend}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
                {SUBACCOUNT_PERMISSIONS.map((code) => (
                    <label
                        key={code}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                        <Checkbox
                            checked={value.includes(code)}
                            onCheckedChange={(checked) => onToggle(code, checked)}
                        />
                        {t(SUBACCOUNT_PERMISSION_LABEL[code])}
                    </label>
                ))}
            </div>
        </fieldset>
    )
}

/** 新建子账号：折叠在卡片头里，点开才展开（默认收起——这一页日常是「看列表」） */
function NewSubaccountCard({ shopId }: { shopId: string }) {
    const t = useT("shop")
    const [open, setOpen] = useState(false)

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
        >
            <Card>
                <CardHeader>
                    <CardTitle>{t("shop.subaccount.new.title")}</CardTitle>
                    <CardDescription>{t("shop.subaccount.new.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                    <CollapsibleTrigger
                        render={
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                            />
                        }
                    >
                        <UserPlus className="size-4" />
                        {t("shop.subaccount.new.trigger")}
                        <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} />
                    </CollapsibleTrigger>
                    {/* 间距归父级 gap（`CollapsibleContent` 自己管间距，调用点不覆写 padding） */}
                    <CollapsibleContent>
                        <NewSubaccountForm
                            shopId={shopId}
                            onCreated={() => setOpen(false)}
                        />
                    </CollapsibleContent>
                </CardContent>
            </Card>
        </Collapsible>
    )
}

function NewSubaccountForm({ shopId, onCreated }: { shopId: string; onCreated: () => void }) {
    const t = useT("shop")
    // 权限勾选不进 schema：它没有「格式」可言，且留空（不给任何权限）是一个合法状态
    const [permissions, setPermissions] = useState<SubaccountPermission[]>([])

    const create = useMutation({
        mutationFn: (value: { loginName: string; phone: string; password: string }) =>
            ShopsApi.createSubaccount({
                path: { shopId },
                body: { ...value, permissions: [...permissions] },
            }),
        meta: {
            success: message("shop.subaccount.new.done"),
            error: message("shop.subaccount.new.failed"),
            // 失效指向列表那一格：新行必须自己长出来，不靠本地拼一行猜后端给了什么
            invalidates: [shopKeys.subaccounts(shopId)],
        },
    })

    const form = useAppForm({
        defaultValues: { loginName: "", phone: "", password: "" },
        validators: { onSubmit: CreateSubaccountFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(value)
                form.reset()
                setPermissions([])
                onCreated()
            } catch (error) {
                // 422 的字段级明细落回输入框（DTO 与表单同名三格）；其余错误交全局 toast
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        loginName: "loginName",
                        phone: "phone",
                        password: "password",
                    }),
                )
                throw error
            }
        },
    })

    return (
        <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
                e.preventDefault()
                void submitForm(form)
            }}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <form.AppField name="loginName">
                    {(field) => (
                        <TextField
                            field={field}
                            id="subaccount-new-loginName"
                            label={t("shop.subaccount.new.loginName")}
                            placeholder={t("shop.subaccount.new.loginNamePlaceholder")}
                            autoComplete="off"
                            maxLength={SUBACCOUNT_LOGIN_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="phone">
                    {(field) => (
                        <TextField
                            field={field}
                            id="subaccount-new-phone"
                            label={t("shop.subaccount.new.phone")}
                            placeholder={t("shop.subaccount.new.phonePlaceholder")}
                            inputMode="tel"
                            autoComplete="off"
                            maxLength={PHONE_DIGITS}
                            filter="digits"
                        />
                    )}
                </form.AppField>
            </div>

            <form.AppField name="password">
                {(field) => (
                    <TextField
                        field={field}
                        id="subaccount-new-password"
                        label={t("shop.subaccount.new.password", { min: PASSWORD_MIN })}
                        type="password"
                        placeholder={t("shop.subaccount.new.passwordPlaceholder")}
                        autoComplete="new-password"
                    />
                )}
            </form.AppField>

            <PermissionPicker
                legend={t("shop.subaccount.new.permissions")}
                value={permissions}
                onToggle={(code, checked) =>
                    setPermissions((prev) =>
                        checked ? [...prev, code] : prev.filter((one) => one !== code),
                    )
                }
            />

            <div className="flex justify-end">
                <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
                    {({ isSubmitting }) => (
                        <SubmitButton
                            pending={isSubmitting}
                            label={t("shop.subaccount.new.submit")}
                            variant="default"
                        />
                    )}
                </form.Subscribe>
            </div>
        </form>
    )
}

function SubaccountList({ shopId }: { shopId: string }) {
    const t = useT("shop")
    // 列表走域内 queryOptions（key 与失效规则同源，路由不直接拼 key）
    const subaccounts = useQuery(subaccountsOptions(shopId))

    if (subaccounts.isPending) {
        return (
            <Card>
                <CardContent className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <Skeleton
                            key={i}
                            className="h-12 w-full rounded-lg"
                        />
                    ))}
                </CardContent>
            </Card>
        )
    }

    if (!subaccounts.data || subaccounts.data.length === 0) {
        return (
            <Card>
                <CardContent>
                    <Empty className="py-10">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <Store />
                            </EmptyMedia>
                            <EmptyTitle>{t("shop.subaccount.empty.title")}</EmptyTitle>
                            <EmptyDescription>{t("shop.subaccount.empty.body")}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        )
    }

    return (
        <SubaccountTable
            shopId={shopId}
            rows={subaccounts.data}
        />
    )
}

function SubaccountTable({ shopId, rows }: { shopId: string; rows: SubaccountItem[] }) {
    const t = useT("shop")
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("shop.subaccount.list.title")}</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("shop.subaccount.col.loginName")}</TableHead>
                            <TableHead>{t("shop.subaccount.col.phone")}</TableHead>
                            <TableHead>{t("shop.subaccount.col.status")}</TableHead>
                            <TableHead>{t("shop.subaccount.col.permissions")}</TableHead>
                            <TableHead>{t("shop.subaccount.col.createdAt")}</TableHead>
                            <TableHead>{t("shop.subaccount.col.actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <SubaccountRow
                                key={row.id}
                                shopId={shopId}
                                row={row}
                            />
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

function SubaccountRow({ shopId, row }: { shopId: string; row: SubaccountItem }) {
    const t = useT("shop")
    const { locale } = useI18n()
    const queryClient = useQueryClient()
    const [editingPermissions, setEditingPermissions] = useState(false)
    const [permissionDraft, setPermissionDraft] = useState<string[]>(row.permissions)
    const [resetOpen, setResetOpen] = useState(false)

    const status = SUBACCOUNT_STATUS_META[row.status]
    /**
     * 这一行是不是「已经停下」。停用/启用是**同一个开关的两侧**，界面一次只画一个：
     * 只有已停用的行给「启用」，其余（待激活 / 已启用）都给「停用」——
     * 对还没验号的行点「启用」在后端是原地不动，画一个点了没反应的按钮比少画一个更糟。
     */
    const disabled = row.status === "DISABLED"

    /** 权限码 → 当前语言的标签；认不出的码显示码本身（静默丢掉一格权限等于谎报这个人能干什么） */
    function permissionText(code: string): string {
        const key = subaccountPermissionLabel(code)
        return key ? t(key) : code
    }

    /** 停用/启用共用一个动作：`enabled` 就是这一格的全部信息（停还是启由当前状态决定） */
    const setStatus = useMutation({
        mutationFn: (enabled: boolean) =>
            ShopsApi.updateSubaccountStatus({
                path: { shopId, subaccountId: row.id },
                body: { enabled },
            }),
        meta: {
            error: disabled
                ? message("shop.subaccount.enable.failed")
                : message("shop.subaccount.disable.failed"),
            invalidates: [shopKeys.subaccounts(shopId)],
        },
    })

    const updatePermissions = useMutation({
        mutationFn: (permissions: string[]) =>
            ShopsApi.updateSubaccountPermissions({
                path: { shopId, subaccountId: row.id },
                body: { permissions },
            }),
        meta: {
            success: message("shop.subaccount.permission.edit.done"),
            error: message("shop.subaccount.permission.edit.failed"),
            invalidates: [shopKeys.subaccounts(shopId)],
        },
        onSuccess: () => setEditingPermissions(false),
    })

    const resetPassword = useMutation({
        mutationFn: (password: string) =>
            ShopsApi.resetSubaccountPassword({
                path: { shopId, subaccountId: row.id },
                body: { password },
            }),
        meta: {
            success: message("shop.subaccount.reset.done"),
            error: message("shop.subaccount.reset.failed"),
        },
    })

    const remove = useMutation({
        mutationFn: () => ShopsApi.removeSubaccount({ path: { shopId, subaccountId: row.id } }),
        meta: {
            success: message("shop.subaccount.remove.done"),
            error: message("shop.subaccount.remove.failed"),
            invalidates: [shopKeys.subaccounts(shopId)],
        },
    })

    // 别人的号码后端只给掩码，明文逐条索取且在后端留痕（ACC-79）。取到写回列表缓存这一行、
    // 故意不失效列表：失效会立刻把刚拿到的明文冲掉，下次重新拉取自然又回掩码，明文不长期驻留
    const revealPhone = useMutation({
        mutationFn: () =>
            ShopsApi.revealSubaccountPhone({ path: { shopId, subaccountId: row.id } }),
        meta: { error: message("shop.subaccount.phone.failed") },
        onSuccess: (res) =>
            queryClient.setQueryData<SubaccountItem[]>(shopKeys.subaccounts(shopId), (prev) =>
                prev?.map((one) => (one.id === row.id ? { ...one, phone: res.phone } : one)),
            ),
    })

    /**
     * 停用/启用共用一个动作：`enabled` 就是这一格的全部信息（停还是启由当前状态决定）。
     *
     * 两向都要二次确认：一个把人挡在门外（已登录的会话当场失效），一个可能是把没验过号的行放回待激活。
     * `tone` 也跟着分：停用是破坏性的，启用不是。
     */
    function confirmToggle(enabled: boolean) {
        void confirm({
            title: enabled
                ? t("shop.subaccount.enable.confirm.title")
                : t("shop.subaccount.disable.confirm.title"),
            description: enabled
                ? t("shop.subaccount.enable.confirm.desc", { loginName: row.loginName })
                : t("shop.subaccount.disable.confirm.desc", { loginName: row.loginName }),
            confirmText: enabled
                ? t("shop.subaccount.action.enable")
                : t("shop.subaccount.action.disable"),
            tone: enabled ? "default" : "destructive",
            action: () => setStatus.mutateAsync(enabled),
        })
    }

    function confirmRemove() {
        void confirm({
            title: t("shop.subaccount.remove.confirm.title"),
            description: t("shop.subaccount.remove.confirm.desc", { loginName: row.loginName }),
            confirmText: t("shop.subaccount.remove.confirm.action"),
            action: () => remove.mutateAsync(),
        })
    }

    return (
        <>
            <TableRow>
                <TableCell variant="strong">{row.loginName}</TableCell>
                <TableCell>
                    <MaskedValueCell
                        value={row.phone}
                        subject={row.loginName}
                        revealing={revealPhone.isPending}
                        onReveal={() => revealPhone.mutate()}
                    />
                </TableCell>
                <TableCell>
                    <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                </TableCell>
                <TableCell variant="muted">
                    {row.permissions.length === 0 ? (
                        t("shop.subaccount.permissions.none")
                    ) : (
                        <span className="flex flex-wrap gap-1">
                            {row.permissions.map((code) => (
                                <Badge
                                    key={code}
                                    variant="outline"
                                >
                                    {permissionText(code)}
                                </Badge>
                            ))}
                        </span>
                    )}
                </TableCell>
                <TableCell variant="muted">{formatDate(row.createdAt, locale)}</TableCell>
                <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={setStatus.isPending}
                            onClick={() => confirmToggle(disabled)}
                        >
                            {disabled
                                ? t("shop.subaccount.action.enable")
                                : t("shop.subaccount.action.disable")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResetOpen(true)}
                        >
                            <KeyRound className="size-4" />
                            {t("shop.subaccount.action.resetPassword")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                // 每次展开都从当前生效的权限重新起草：留着上一次没保存的草稿
                                // 会让「取消」之后再点开看到一个从没存在过的集合
                                setPermissionDraft(row.permissions)
                                setEditingPermissions((open) => !open)
                            }}
                        >
                            <ShieldCheck className="size-4" />
                            {t("shop.subaccount.action.permissions")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={remove.isPending}
                            aria-label={t("shop.subaccount.action.remove")}
                            onClick={confirmRemove}
                        >
                            <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
            {editingPermissions ? (
                <TableRow>
                    <TableCell colSpan={6}>
                        <div className="flex flex-col gap-4 py-2">
                            <PermissionPicker
                                legend={t("shop.subaccount.permission.edit.title", {
                                    loginName: row.loginName,
                                })}
                                value={permissionDraft}
                                onToggle={(code, checked) =>
                                    setPermissionDraft((prev) =>
                                        checked
                                            ? [...prev, code]
                                            : prev.filter((one) => one !== code),
                                    )
                                }
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingPermissions(false)}
                                >
                                    {t("shop.subaccount.action.cancel")}
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={updatePermissions.isPending}
                                    onClick={() => updatePermissions.mutate(permissionDraft)}
                                >
                                    {updatePermissions.isPending && <Spinner />}
                                    {t("shop.subaccount.permission.edit.save")}
                                </Button>
                            </div>
                        </div>
                    </TableCell>
                </TableRow>
            ) : undefined}
            {resetOpen ? (
                <ResetPasswordDialog
                    loginName={row.loginName}
                    pending={resetPassword.isPending}
                    onClose={() => setResetOpen(false)}
                    onSubmit={(password) => resetPassword.mutateAsync(password)}
                />
            ) : undefined}
        </>
    )
}

/**
 * 重置口令：弹一层只问「新口令」。
 *
 * 它单独成组件而不是在行里用 state 控制一个 Dialog：`useAppForm` 一旦挂在行组件上，
 * 关掉弹窗再打开会看到上一次的输入（form 实例没重建）。挂在这层、由调用方条件渲染，
 * 每次打开都是一个干净的表单。
 */
function ResetPasswordDialog({
    loginName,
    pending,
    onClose,
    onSubmit,
}: {
    loginName: string
    pending: boolean
    onClose: () => void
    onSubmit: (password: string) => Promise<unknown>
}) {
    const t = useT("shop")
    const form = useAppForm({
        defaultValues: { password: "" },
        validators: { onSubmit: ResetSubaccountPasswordFormSchema },
        onSubmit: async ({ value }) => {
            try {
                await onSubmit(value.password)
                onClose()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { password: "password" }))
                throw error
            }
        },
    })

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next && !pending) onClose()
            }}
        >
            <DialogContent>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submitForm(form)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t("shop.subaccount.reset.title")}</DialogTitle>
                        <DialogDescription>
                            {t("shop.subaccount.reset.desc", { loginName })}
                        </DialogDescription>
                    </DialogHeader>

                    <form.AppField name="password">
                        {(field) => (
                            <TextField
                                field={field}
                                id="subaccount-reset-password"
                                label={t("shop.subaccount.reset.password", { min: PASSWORD_MIN })}
                                skin="filled"
                                type="password"
                                autoComplete="new-password"
                                placeholder={t("shop.subaccount.reset.passwordPlaceholder")}
                            />
                        )}
                    </form.AppField>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={onClose}
                        >
                            {t("shop.subaccount.action.cancel")}
                        </Button>
                        <SubmitButton
                            pending={pending}
                            label={t("shop.subaccount.reset.submit")}
                            variant="default"
                        />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
