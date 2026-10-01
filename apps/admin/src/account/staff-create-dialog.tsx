import { useState } from "react"
import { AdminAccountApi, type StaffRole } from "@shop/api/sdk"
import { serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { usePasswordVisibility } from "@shop/app-kit/auth"
import { useMutation } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    PasswordToggle,
    Spinner,
    applyServerFieldErrors,
    useAppForm,
} from "@shop/ui-web"
import { accountKeys } from "./queries"
import {
    CreateStaffSchema,
    DISPLAY_NAME_MAX,
    EMPLOYEE_NO_MAX,
    type CreateStaffValue,
} from "./staff-form"
import { STAFF_ROLE_ITEMS } from "./constants"

/**
 * 创建平台员工（ACC-57）。
 *
 * 岗位是必选而不是「默认运营」：创建时就想清楚「这个人要干什么」比事后调岗安全
 * ——调岗有「不能改自己」与「末位超管不可降级」两道禁令，是个需要解释的动作；
 * 创建时选错只是多招一个人。末位超管的保护因此只落在调岗位与禁用上。
 */
export function StaffCreateDialog() {
    const [open, setOpen] = useState(false)
    const password = usePasswordVisibility()
    const { locale } = useI18n()

    const create = useMutation({
        mutationFn: (value: CreateStaffValue) =>
            AdminAccountApi.adminCreateStaff({
                body: {
                    employeeNo: value.employeeNo,
                    password: value.password,
                    displayName: value.displayName || undefined,
                    role: value.role,
                },
            }),
        meta: {
            success: "员工已创建",
            error: "创建员工失败",
            invalidates: [accountKeys.staff.all],
        },
        onSuccess: () => setOpen(false),
    })

    const form = useAppForm({
        defaultValues: { employeeNo: "", password: "", displayName: "", role: "OPS" as StaffRole },
        validators: { onSubmit: CreateStaffSchema },
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(value)
            } catch (error) {
                // 后端 422 的字段级明细落到对应输入框：CreateStaffRequest 的四个组件名与表单字段
                // 全部同名（工号的形状、口令的 8~72 档、姓名上限、岗位缺省），逐个列出等于「确认过同名」。
                // toast 仍由 mutation 的 meta.error 发，两条通道各说各的粒度
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, {
                        employeeNo: "employeeNo",
                        password: "password",
                        displayName: "displayName",
                        role: "role",
                    }),
                )
                // 原样抛出：form-core 才知道这次没成（见 submitForm 的注释）
                throw error
            }
            form.reset()
        },
    })

    return (
        <>
            <Button
                size="sm"
                onClick={() => setOpen(true)}
            >
                新建员工
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>新建平台员工</DialogTitle>
                    <form
                        className="mt-4 flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            // rethrow 的那条由 submitForm 接住（接口错误静默，toast 已经由 meta 发过）
                            void submitForm(form)
                        }}
                    >
                        <form.AppField name="employeeNo">
                            {(field) => (
                                <field.TextField
                                    label="工号"
                                    required
                                    maxLength={EMPLOYEE_NO_MAX}
                                    placeholder="登录账号，字母数字与短横"
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="displayName">
                            {(field) => (
                                <field.TextField
                                    label="姓名"
                                    maxLength={DISPLAY_NAME_MAX}
                                    placeholder="真名 / 展示名，可留空"
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="password">
                            {(field) => (
                                <field.TextField
                                    label="初始口令"
                                    required
                                    type={password.inputType}
                                    autoComplete="new-password"
                                    placeholder="至少 8 位"
                                    className="pr-10"
                                    trailing={<PasswordToggle {...password.toggleProps} />}
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="role">
                            {(field) => (
                                <field.SelectField
                                    label="岗位"
                                    items={STAFF_ROLE_ITEMS}
                                />
                            )}
                        </form.AppField>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                disabled={create.isPending}
                            >
                                {create.isPending && <Spinner />}创建
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
