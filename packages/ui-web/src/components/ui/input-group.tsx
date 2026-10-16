import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "src/lib/utils"
import { Button } from "src/components/ui/button"
import { Input } from "src/components/ui/input"
import { Textarea } from "src/components/ui/textarea"

/** filled：描边用 transparent 占位（非 border-0），聚焦染色时内容不横跳 1px；底色必须不透明（半透明会把身后装饰层透上来染成两种灰） */
const INPUT_GROUP_VARIANTS = {
  default: "",
  filled:
    "border-transparent bg-sunken has-[[data-slot=input-group-control]:focus-visible]:bg-card",
} as const

/** lg：h-11 + 大圆角。横向内缩也归这档——同表单各框文字左边缘须齐平，散写 px-3.5 会漏；后代选择器权重高于 Input/Addon 自带内距，调用点不必补 */
const INPUT_GROUP_SIZES = {
  default: "",
  lg: "h-11 rounded-lg [&_[data-slot=input-group-control]]:px-3.5 [&_[data-slot=input-group-addon]]:pl-3.5",
} as const

/** code：逐位核对的一次性码，字符拉开；占位提示是句子，保持 normal-case 不被 uppercase 带跑 */
const INPUT_GROUP_INPUT_VARIANTS = {
  default: "",
  code: "tracking-widest uppercase placeholder:normal-case",
} as const

/** 输入框基类。placeholder:tracking-normal 是不变量：调用方为内容设的字距不该拉散占位提示 */
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
  /** 整组（非控件）的无效表现，走 data-invalid 而非 aria-invalid。属性须存在性正确：false 会渲染成 data-invalid="false" 仍被选择器命中，故传值用 ? "" : undefined */
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
