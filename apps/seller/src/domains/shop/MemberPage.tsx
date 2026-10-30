import type { OperatorView, RoleView } from "@shop/api/sdk"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { serverFieldErrors } from "@shop/app-kit/forms"
import { PermissionCodes } from "@shop/common/contract"
import {
    Badge,
    Button,
    Checkbox,
    Label,
    Skeleton,
    Spinner,
    useAppForm,
    applyServerFieldErrors,
} from "@shop/ui-web"
import { z } from "zod"

import { useT } from "#/locales/use-t"
import { submitForm } from "@shop/app-kit/forms"
import {
    operatorsOptions,
    rolesOptions,
    shopsOptions,
    useCreateOperator,
    useCreateRole,
    useDeleteRole,
    useResetOperatorPassword,
    useUpdateOperator,
    useUpdateOperatorStatus,
} from "./member-queries"

/**
 * 子账号与角色管理（主账号专属，端点层有 SELLER_STAFF_MANAGE 闸）。
 *
 * <p>角色是授权单位：建角色挑权限点（服务端拒收动钱与管钥匙的码），子账号挂角色 +
 * 授权店铺范围。授予清单 = seller 域非 high 码（见 contracts/permissions.yaml）。
 */
export function MemberPage() {
    const t = useT()
    const [tab, setTab] = useState<"operators" | "roles">("operators")

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-semibold">{t("shop.member.page.title")}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t("shop.member.page.description")}
                    </p>
                </div>
                <div className="flex gap-1.5">
                    <Button
                        variant={tab === "operators" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setTab("operators")}
                    >
                        {t("shop.member.tab.operators")}
                    </Button>
                    <Button
                        variant={tab === "roles" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setTab("roles")}
                    >
                        {t("shop.member.tab.roles")}
                    </Button>
                </div>
            </div>
            {tab === "operators" ? <OperatorsPanel /> : <RolesPanel />}
        </div>
    )
}

function OperatorsPanel() {
    const t = useT()
    const [creating, setCreating] = useState(false)
    const { data: operators = [], isPending } = useQuery(operatorsOptions())

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <FieldTitle text={t("shop.member.operators.title")} />
                {!creating && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        {t("shop.member.operators.add")}
                    </Button>
                )}
            </div>
            {creating && <OperatorForm onDone={() => setCreating(false)} />}
            {isPending ? (
                <Skeleton className="h-24 w-full" />
            ) : operators.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("shop.member.operators.empty")}</p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {operators.map((operator) => (
                        <OperatorRow
                            key={operator.id}
                            operator={operator}
                        />
                    ))}
                </ul>
            )}
        </section>
    )
}

function OperatorRow({ operator }: { operator: OperatorView }) {
    const t = useT()
    const status = useUpdateOperatorStatus()
    const disabled = operator.status === "disabled"

    return (
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <span className="font-mono text-xs">{operator.loginName}</span>
            <span className="text-sm font-medium">{operator.displayName}</span>
            <Badge variant={disabled ? "outline" : "success"}>
                {t(disabled ? "shop.member.status.disabled" : "shop.member.status.active")}
            </Badge>
            {operator.roles.map((role) => (
                <Badge
                    key={role.id}
                    variant="info"
                >
                    {role.name}
                </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
                {operator.shops.map((shop) => shop.name).join("、") || t("shop.member.noShop")}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
                <GrantDialogTrigger operator={operator} />
                <Button
                    variant="outline"
                    size="sm"
                    disabled={status.isPending}
                    onClick={() =>
                        void status.mutateAsync({
                            operatorId: operator.id,
                            status: disabled ? "active" : "disabled",
                        })
                    }
                >
                    {t(disabled ? "shop.member.status.enable" : "shop.member.status.disable")}
                </Button>
            </div>
        </li>
    )
}

function OperatorForm({ onDone }: { onDone: () => void }) {
    const t = useT()
    const create = useCreateOperator()
    const { data: roles = [] } = useQuery(rolesOptions())
    const { data: shops = [] } = useQuery(shopsOptions())

    const [selected, setSelected] = useState<{ roleIds: string[]; shopIds: string[] }>({
        roleIds: [],
        shopIds: [],
    })
    const form = useAppForm({
        defaultValues: { loginName: "", password: "", displayName: "" },
        validators: {
            onSubmit: z.object({
                loginName: z.string().trim().min(4).max(32),
                password: z.string().min(8).max(72),
                displayName: z.string().trim().min(1),
            }),
        },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync({
                    loginName: value.loginName.trim(),
                    password: value.password,
                    displayName: value.displayName.trim(),
                    roleIds: selected.roleIds,
                    shopIds: selected.shopIds,
                })
                onDone()
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { loginName: "loginName" }))
                throw error
            }
        },
    })
    return (
        <form
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            onSubmit={(event) => {
                event.preventDefault()
                void submitForm(form)
            }}
        >
            <div className="grid gap-3 sm:grid-cols-3">
                <form.AppField name="loginName">
                    {(field) => (
                        <field.TextField
                            label={t("shop.member.form.loginName")}
                            required
                            hint={t("shop.member.form.loginNameHint")}
                        />
                    )}
                </form.AppField>
                <form.AppField name="password">
                    {(field) => (
                        <field.TextField
                            label={t("shop.member.form.password")}
                            required
                            type="password"
                        />
                    )}
                </form.AppField>
                <form.AppField name="displayName">
                    {(field) => (
                        <field.TextField
                            label={t("shop.member.form.displayName")}
                            required
                        />
                    )}
                </form.AppField>
            </div>
            <CheckGroup
                label={t("shop.member.form.roles")}
                options={roles.map((role) => ({ value: role.id, label: role.name }))}
                value={selected.roleIds}
                onChange={(roleIds) => setSelected((prev) => ({ ...prev, roleIds }))}
            />
            <CheckGroup
                label={t("shop.member.form.shops")}
                options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
                value={selected.shopIds}
                onChange={(shopIds) => setSelected((prev) => ({ ...prev, shopIds }))}
            />
            <div className="flex items-center gap-2">
                <Button
                    type="submit"
                    size="sm"
                    disabled={create.isPending}
                >
                    {create.isPending && <Spinner />}
                    {t("common.action.save")}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("common.action.cancel")}
                </Button>
            </div>
        </form>
    )
}

function GrantDialogTrigger({ operator }: { operator: OperatorView }) {
    const t = useT()
    const [open, setOpen] = useState(false)
    return (
        <>
            {/* 编辑授权（角色 + 店铺）与重置密码收在一张弹层里 */}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
            >
                {t("shop.member.grant")}
            </Button>
            {open && (
                <GrantEditor
                    operator={operator}
                    onDone={() => setOpen(false)}
                />
            )}
        </>
    )
}

function GrantEditor({ operator, onDone }: { operator: OperatorView; onDone: () => void }) {
    const t = useT()
    const update = useUpdateOperator()
    const resetPassword = useResetOperatorPassword()
    const { data: roles = [] } = useQuery(rolesOptions())
    const { data: shops = [] } = useQuery(shopsOptions())
    const [roleIds, setRoleIds] = useState<string[]>(operator.roles.map((role) => role.id))
    const [shopIds, setShopIds] = useState<string[]>(operator.shops.map((shop) => shop.id))
    const [password, setPassword] = useState("")
    return (
        <div className="fixed inset-0 z-overlay flex items-center justify-center bg-black/40 p-4">
            <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium">{operator.loginName}</p>
                <CheckGroup
                    label={t("shop.member.form.roles")}
                    options={roles.map((role) => ({ value: role.id, label: role.name }))}
                    value={roleIds}
                    onChange={setRoleIds}
                />
                <CheckGroup
                    label={t("shop.member.form.shops")}
                    options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
                    value={shopIds}
                    onChange={setShopIds}
                />
                <Label className="flex flex-col">
                    {t("shop.member.form.resetPassword")}
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-1 h-9 rounded-md border border-border px-3 text-sm"
                        placeholder={t("shop.member.form.resetPasswordHint")}
                    />
                </Label>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        disabled={update.isPending}
                        onClick={() =>
                            void update
                                .mutateAsync({ operatorId: operator.id, roleIds, shopIds })
                                .then(() => onDone())
                        }
                    >
                        {update.isPending && <Spinner />}
                        {t("common.action.save")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={password.length < 8 || resetPassword.isPending}
                        onClick={() =>
                            void resetPassword
                                .mutateAsync({ operatorId: operator.id, password })
                                .then(() => setPassword(""))
                        }
                    >
                        {t("shop.member.form.resetPasswordSubmit")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDone}
                    >
                        {t("common.action.cancel")}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function RolesPanel() {
    const t = useT()
    const [creating, setCreating] = useState(false)
    const { data: roles = [], isPending } = useQuery(rolesOptions())

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <FieldTitle text={t("shop.role.title")} />
                {!creating && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreating(true)}
                    >
                        <PlusIcon data-slot="icon" />
                        {t("shop.role.add")}
                    </Button>
                )}
            </div>
            {creating && <RoleForm onDone={() => setCreating(false)} />}
            {isPending ? (
                <Skeleton className="h-24 w-full" />
            ) : roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("shop.role.empty")}</p>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {roles.map((role) => (
                        <RoleRowItem
                            key={role.id}
                            role={role}
                        />
                    ))}
                </ul>
            )}
        </section>
    )
}

function RoleRowItem({ role }: { role: RoleView }) {
    const t = useT()
    const remove = useDeleteRole()

    return (
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <span className="font-mono text-xs">{role.code}</span>
            <span className="text-sm font-medium">{role.name}</span>
            <span className="text-xs text-muted-foreground">
                {t("shop.role.permissionCount", { count: role.permissionCodes.length })}
            </span>
            <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={() => void remove.mutateAsync(role.id)}
            >
                {t("shop.role.delete")}
            </Button>
        </li>
    )
}

/** 可授予的权限点 = seller 域非 high 码（管理钥匙与动钱出口由服务端拒收，这里不画） */
const PERM_LABELS = {
    PRODUCT_WRITE: "shop.perm.PRODUCT_WRITE",
    PRODUCT_READ: "shop.perm.PRODUCT_READ",
    ORDER_READ: "shop.perm.ORDER_READ",
    ORDER_REFUND: "shop.perm.ORDER_REFUND",
    SHOP_READ: "shop.perm.SHOP_READ",
    SHIPPING_MANAGE: "shop.perm.SHIPPING_MANAGE",
    FINANCE_READ: "shop.perm.FINANCE_READ",
} as const

const GRANTABLE_CODES = [
    PermissionCodes.PRODUCT_WRITE,
    PermissionCodes.PRODUCT_READ,
    PermissionCodes.ORDER_READ,
    PermissionCodes.ORDER_REFUND,
    PermissionCodes.SHOP_READ,
    PermissionCodes.SHIPPING_MANAGE,
    PermissionCodes.FINANCE_READ,
] as const

function RoleForm({ onDone }: { onDone: () => void }) {
    const t = useT()
    const create = useCreateRole()
    const [name, setName] = useState("")
    const [code, setCode] = useState("")
    const [codes, setCodes] = useState<string[]>([])

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <Label className="flex flex-col">
                    {t("shop.role.form.code")}
                    <input
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        className="mt-1 h-9 rounded-md border border-border px-3 font-mono text-sm"
                        placeholder="cashier"
                    />
                </Label>
                <Label className="flex flex-col">
                    {t("shop.role.form.name")}
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-1 h-9 rounded-md border border-border px-3 text-sm"
                    />
                </Label>
            </div>
            <CheckGroup
                label={t("shop.role.form.permissions")}
                options={GRANTABLE_CODES.map((permissionCode) => ({
                    value: permissionCode,
                    label: t(PERM_LABELS[permissionCode]),
                }))}
                value={codes}
                onChange={setCodes}
            />
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    disabled={create.isPending || !name.trim() || !code.trim()}
                    onClick={() =>
                        void create
                            .mutateAsync({
                                code: code.trim(),
                                name: name.trim(),
                                permissionCodes: codes,
                            })
                            .then(() => onDone())
                    }
                >
                    {create.isPending && <Spinner />}
                    {t("common.action.save")}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDone}
                >
                    {t("common.action.cancel")}
                </Button>
            </div>
        </div>
    )
}

function CheckGroup({
    label,
    options,
    value,
    onChange,
}: {
    label: string
    options: { value: string; label: string }[]
    value: string[]
    onChange: (next: string[]) => void
}) {
    const selected = new Set(value)
    return (
        <div className="flex flex-col gap-1.5">
            <FieldTitle text={label} />
            <div className="flex flex-wrap gap-x-4 gap-y-2">
                {options.map((option) => {
                    const checked = selected.has(option.value)
                    return (
                        <Label key={option.value}>
                            <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                    onChange(
                                        checked
                                            ? value.filter((item) => item !== option.value)
                                            : [...value, option.value],
                                    )
                                }
                            />
                            {option.label}
                        </Label>
                    )
                })}
            </div>
        </div>
    )
}

function FieldTitle({ text }: { text: string }) {
    return <p className="text-sm font-medium text-foreground">{text}</p>
}
