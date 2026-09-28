import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "src/lib/utils"

import { Label } from "src/components/ui/label"

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )
}

/**
 * 字段布局容器：label + 控件 + 行内错误/说明，三端唯一的字段排版来源（间距密度住这里，调用点不盖）。
 * vertical = label 在控件上方；horizontal = label 固定左列（w-16、顶对齐贴住控件首行），
 * 其余子元素（控件、错误、说明）依次落在右列。
 */
const fieldVariants = cva("group/field w-full", {
  variants: {
    orientation: {
      vertical: "flex flex-col gap-1.5 *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "grid grid-cols-[4rem_1fr] items-start gap-x-4 gap-y-1.5 *:min-w-0 *:not-data-[slot=field-label]:col-start-2 *:data-[slot=field-label]:pt-2.5",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
})

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        className
      )}
      {...props}
    />
  )
}

/** `required`：必填星号走伪元素 utility（styles.css 的 @utility required-mark），不进 label 的文本内容
    （label 文本保持纯净，供屏幕阅读器与测试查询精确匹配；必填语义由表单校验/aria 传达） */
function FieldLabel({
  className,
  required,
  ...props
}: React.ComponentProps<typeof Label> & { required?: boolean }) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50 *:data-[slot=field]:p-2.5",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        required && "required-mark",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/**
 * 字段级次说明。这一行灰字在本设计系统里只有一个密度（DESIGN.md §3 定在 text-2xs=13px，
 * CJK 下 12px 的辅助文字已经开始糊），密度归原语持有，调用点不各自盖。
 */
function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-left text-2xs leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

/** 错误归一化：TanStack Form 的 errors 里既有 zod issue（{ message }）也有校验函数直接返回的字符串 */
function errorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message)
  }
  return undefined
}

/** 行内错误：`role="alert"` 让校验失败被读屏播报，多条 message 去重后单条直出、多条成列表 */
function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: ReadonlyArray<unknown>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    const messages = [...new Set((errors ?? []).map(errorMessage).filter(Boolean))]

    if (messages.length === 0) {
      return null
    }

    if (messages.length === 1) {
      return messages[0]
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-2xs font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldContent,
  FieldTitle,
}
