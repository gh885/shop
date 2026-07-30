import { createFormHook, createFormHookContexts } from '@tanstack/react-form';

import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { cn } from 'src/lib/utils';

/**
 * 表单基础设施（基于 TanStack Form 官方 createFormHook 模式）
 *
 * 业务侧用法：
 * ```tsx
 * const form = useAppForm({
 *     defaultValues: { phone: '' },
 *     onSubmit: async ({ value }) => { ... },
 * });
 *
 * <form.AppField name="phone" validators={{ onChange: PhoneSchema }}>
 *     {(field) => <field.TextField label="手机号" placeholder="请输入手机号" />}
 * </form.AppField>
 * <form.AppForm>
 *     <form.SubmitButton>登录</form.SubmitButton>
 * </form.AppForm>
 * ```
 *
 * 校验统一用 Zod schema（validators.onChange / onBlur / onSubmit），
 * 错误文案取自 schema 的 message，与 packages/api 的契约保持一致。
 */

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

// ---------- 错误归一化（zod issue / string / 其他） ----------

function errorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
}

// ---------- 字段组件 ----------

interface TextFieldProps {
    label?: string;
    placeholder?: string;
    type?: 'text' | 'password' | 'tel' | 'email';
    autoComplete?: string;
    maxLength?: number;
    className?: string;
}

function TextField({
    label,
    placeholder,
    type = 'text',
    autoComplete,
    maxLength,
    className,
}: TextFieldProps) {
    const field = useFieldContext<string>();
    const errors = field.state.meta.errors;
    const showError = field.state.meta.isTouched && errors.length > 0;

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            {label && (
                <label
                    htmlFor={field.name}
                    className="text-sm font-medium"
                >
                    {label}
                </label>
            )}
            <Input
                id={field.name}
                name={field.name}
                type={type}
                placeholder={placeholder}
                autoComplete={autoComplete}
                maxLength={maxLength}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={showError || undefined}
            />
            {showError && (
                <p className="text-[13px] text-destructive">
                    {errors.map(errorMessage).join('，')}
                </p>
            )}
        </div>
    );
}

function PasswordField(props: Omit<TextFieldProps, 'type'>) {
    return (
        <TextField
            {...props}
            type="password"
        />
    );
}

// ---------- 表单级组件 ----------

function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
    const form = useFormContext();
    return (
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
                <Button
                    type="submit"
                    className={className}
                    disabled={!canSubmit || isSubmitting}
                >
                    {isSubmitting ? '提交中…' : children}
                </Button>
            )}
        </form.Subscribe>
    );
}

// ---------- 导出 ----------

export const { useAppForm, withForm } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        TextField,
        PasswordField,
    },
    formComponents: {
        SubmitButton,
    },
});
