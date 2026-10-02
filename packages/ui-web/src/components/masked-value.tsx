import { Button } from "./ui/button"
import { Spinner } from "./ui/spinner"

/** 掩码的唯一形状：后端出参的脱敏号码就是「前 3 + 四个星 + 后 4」 */
const MASK_SEGMENT = "****"

/**
 * 语言中立默认：按钮文案与那句带参数的可访问名都由 app-kit 的 I18nProvider 用
 * `configureMaskedValueLabels` 注入 catalog 那一份（同 confirm 机制）。可访问名是「查看{谁}的号码 {值}」
 * 这种带槽位的整句——在组件里把 subject/value 拼成句子正是 §7.3 禁的反模式，所以那句留在 catalog，
 * provider 用带参数的 t() 编成一个函数注进来。
 */
const defaultLabels: {
    view: string
    ariaFor: (subject: string | undefined, value: string) => string
} = {
    view: "",
    ariaFor: (_subject, value) => value,
}

/** 注入脱敏字段的按钮文案与可访问名生成器（切语言随 t() 再调） */
export function configureMaskedValueLabels(labels: Partial<typeof defaultLabels>) {
    Object.assign(defaultLabels, labels)
}

export interface MaskedValueCellProps {
    /** 当前显示的值：掩码，或已索取到的明文 */
    value: string
    /** 索取明文的动作：只有显示的是掩码时才给入口 */
    onReveal: () => void
    /** 这一条正在索取中 */
    revealing?: boolean
    /** 是谁的号码（店主名 / 收件人名）：缺席时可访问名靠这一格显示的号码本身区分 */
    subject?: string
    /** 按钮文案；不传则取 configureMaskedValueLabels 注入的那份 */
    viewLabel?: string
    /** 索取按钮的可访问名；不传则用注入的 ariaFor(subject, value) 生成 */
    revealAriaLabel?: string
}

/**
 * 脱敏字段 + 「查看」逐条索取明文。
 *
 * 后端恒发掩码，明文一次只换一条，而且每次索取都会在后端留下一条取用记录
 * （ACC-79 / ORD-62）——所以索取中必须禁用：连点不是「多看一眼」，是凭空多出几条审计记录。
 *
 * 「这是不是掩码」只看这一个字符串里有没有那四个星：明文写回这一行后入口自然消失，
 * 调用点不必另立一份「已揭示 id 集合」的状态（那份状态和缓存一比就会过期不一致）。
 */
export function MaskedValueCell({
    value,
    onReveal,
    revealing = false,
    subject,
    viewLabel = defaultLabels.view,
    revealAriaLabel = defaultLabels.ariaFor(subject, value),
}: MaskedValueCellProps) {
    return (
        <span className="flex items-center gap-1.5">
            {/* 值的排版不开放给调用方（no-restyle）：字号/次要色由所在单元格包一层继承下来，
                这里只保证等宽数字与「不把同行按钮挤出可视区」 */}
            <span className="min-w-0 truncate tabular-nums">{value}</span>
            {value.includes(MASK_SEGMENT) && (
                <Button
                    variant="link"
                    size="xs"
                    aria-label={revealAriaLabel}
                    disabled={revealing}
                    onClick={onReveal}
                >
                    {revealing && <Spinner />}
                    {viewLabel}
                </Button>
            )}
        </span>
    )
}
