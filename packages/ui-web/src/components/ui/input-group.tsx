import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"
import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
import { Textarea } from "src/components/ui/textarea"

/** 填充式：静止态是一块不透明的 sunken 灰、看不见描边；聚焦才翻白，描边由基类那条
    `:focus-visible` 规则染成 primary（淘宝/京东同款：灰底说「这里有格子」，橙框说「是这一格」）。
    两件事：
    1. 描边用 transparent 占位而不是 `border-0`——宽度一直在，聚焦染色时内容不会横跳 1px。
    2. 底色必须不透明。曾经的 `bg-muted/70` 会把身后的装饰层透上来：登录弹窗顶部那片
       primary 环境光正好罩住第一个输入框，于是「手机号」和「验证码」被染成两种灰。 */
const INPUT_GROUP_VARIANTS = {
  default: "",
  filled:
    "border-transparent bg-sunken has-[[data-slot=input-group-control]:focus-visible]:bg-card",
} as const

/** 大表单档：h-11 + 大圆角（登录/注册这类字段）。
    横向内缩也归这一档管：同一表单里手机号 / 验证码 / 密码三个框的文字左边缘必须齐平，
    散在调用点上各写一份 `px-3.5` 一定会漏——密码框就漏过一次，切 Tab 时文字左右跳。
    后代选择器的权重高于 Input 自带的 px-2.5 与 Addon 自带的 pl-2，调用点不必再补。 */
const INPUT_GROUP_SIZES = {
  default: "",
  lg: "h-11 rounded-lg [&_[data-slot=input-group-control]]:px-3.5 [&_[data-slot=input-group-addon]]:pl-3.5",
} as const

/** 输入框的字符排版档。`code` 用于逐位核对的一次性码（图形验证码 / 短信验证码）：
    字符拉开便于逐位对读；占位提示保持正常大小写——提示是句子，不该被输入框的大写带跑。
    （占位符的字距由基类统一归零，见 INPUT_GROUP_INPUT_BASE） */
const INPUT_GROUP_INPUT_VARIANTS = {
  default: "",
  code: "tracking-widest uppercase placeholder:normal-case",
} as const

/** 输入框基类。`placeholder:tracking-normal` 是不变量：占位符是提示语不是被输入的内容，
    调用方为内容设的字距（tracking-wide/widest）不该把提示文字一起拉散。 */
const INPUT_GROUP_INPUT_BASE =
  "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 placeholder:tracking-normal focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0"

function InputGroup({
  className,
  variant = "default",
  size = "default",
  invalid = false,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: keyof typeof INPUT_GROUP_VARIANTS
  size?: keyof typeof INPUT_GROUP_SIZES
  /** 服务端判定该组内容有误（验证码错之类）：加一档更强的红环 + 一次性抖动。
      这不是 aria-invalid（那是控件的事），是整组的表现，所以走 data-invalid。
      注意：属性必须"存在性"正确——`false` 会渲染成 `data-disabled="false"` 仍被选择器命中，
      所以用 `? "" : undefined`。 */
  invalid?: boolean
}) {
  return (
    <div
      data-slot="input-group"
      data-invalid={invalid ? "" : undefined}
      role="group"
      className={cn(
        "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none data-invalid:motion-safe:animate-shake data-invalid:ring-2 data-invalid:ring-destructive/40 in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-primary/25 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        INPUT_GROUP_VARIANTS[variant],
        INPUT_GROUP_SIZES[size],
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
      },
      /** quiet：常规字重。基类的 font-medium 用在前缀（"+86"）上正好，
          但密集表单里的单位/计数后缀（"元"、"{n}/30"）偏重。
          counter：再小一档——字符计数（"{n}/30"）比单位后缀更次要，字号也跟着让一档 */
      variant: {
        default: "",
        quiet: "font-normal",
        counter: "text-xs font-normal",
      },
    },
    defaultVariants: {
      align: "inline-start",
      variant: "default",
    },
  }
)

function InputGroupAddon({
  className,
  align = "inline-start",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align, variant }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "flex items-center gap-2 text-sm shadow-none",
  {
    variants: {
      size: {
        xs: "h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
        sm: "",
        "icon-xs":
          "size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & {
  variant?: keyof typeof INPUT_GROUP_INPUT_VARIANTS
}) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(INPUT_GROUP_INPUT_BASE, INPUT_GROUP_INPUT_VARIANTS[variant], className)}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
