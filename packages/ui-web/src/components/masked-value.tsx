import { Button } from "./ui/button"
import { Spinner } from "./ui/spinner"

/** 掩码的唯一形状：后端出参的脱敏号码就是「前 3 + 四个星 + 后 4」 */
const MASK_SEGMENT = "****"

export interface MaskedValueCellProps {
    /** 当前显示的值：掩码，或已索取到的明文 */
    value: string
    /** 索取明文的动作：只有显示的是掩码时才给入口 */
    onReveal: () => void
    /** 这一条正在索取中 */
    revealing?: boolean
    /** 是谁的号码（店主名 / 买家名 / 成员名）：给按钮补可访问名 */
    subject?: string
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
                    aria-label={subject ? `查看${subject}的号码` : undefined}
                    disabled={revealing}
                    onClick={onReveal}
                >
                    {revealing && <Spinner />}
                    查看
                </Button>
            )}
        </span>
    )
}
