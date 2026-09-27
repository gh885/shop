/**
 * 注销账号弹窗的展示常量：冷静期长度、三档处置清单、清单的语气色。
 *
 * 搬出组件的理由是「三档口径要与后端一致」这条要求——清单会改，改在一个只有渲染
 * 才看得见的文件里，没人能在 node 里对着 ACC-76 的口径核一遍。
 */

/** 冷静期天数，与后端 AccountDeletionTimeouts.COOLING_OFF 同值（只用于文案；确切生效时刻由接口给） */
export const COOLING_OFF_DAYS = 15

/** 三档处置的轻重：会丢 → 匿名留下 → 依法必须留 */
export type DispositionTone = "lost" | "kept" | "legal"

/** 三档处置：标题就是「你能拿回什么」，所以按不可逆程度从重到轻排 */
export const DISPOSITIONS: { title: string; items: string; tone: DispositionTone }[] = [
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

/** 语气 → 颜色：与 ui-web 的语义色一一对应，不写具体色值 */
export const TONE_CLASS: Record<DispositionTone, string> = {
    lost: "text-destructive",
    kept: "text-foreground",
    legal: "text-muted-foreground",
}
