package com.shop.platform.aftersale.model;

/**
 * 售后状态机转移表 —— 每一行是一条合法转移（from → target），也是售后线的<b>状态机唯一真相</b>。
 * 之所以不从 {@link TicketStatus} 反推（像订单主状态机那样 sourcesOf），是因为退货退款让 REFUNDED 有了两个来源
 * （仅退款 APPLYING→REFUNDED、退货 RETURNING→REFUNDED），而两者的副作用不同（前者不回补库存、后者回补）
 * ——「该不该回补」只能由<b>知道来源的动作</b>决定，不能由目标态反推。
 *
 * <p>每行还携带：发起方、抢不到转移（条件更新影响行数 0）时的 409 文案。动作名即 ticket_events.action。
 * 侧效应（退款走网关、退货回补库存、发事件、写回订单投影）不属于状态转移本身，由 service 在转移成功后编排。
 */
public enum TicketAction {

    /** 买家申请售后（仅退款或退货退款，申请时定 type）；from 为空 = 新建单据 */
    APPLY(null, TicketStatus.APPLYING, TicketActor.BUYER, "当前不可申请售后"),

    /** 卖家同意<b>仅退款</b>：APPLYING → REFUNDED，一步退款（货不退、无回补） */
    REFUND(TicketStatus.APPLYING, TicketStatus.REFUNDED, TicketActor.SELLER, "售后单状态已变更，当前不可同意"),

    /** 卖家同意<b>退货退款</b>：APPLYING → RETURNING（进入退货流程，暂不退款） */
    AGREE_RETURN(TicketStatus.APPLYING, TicketStatus.RETURNING, TicketActor.SELLER, "售后单状态已变更，当前不可同意"),

    /** 买家回寄并填写退货物流单：态不变（仍是 RETURNING），只落物流单号并记时间线 */
    RETURN_GOODS(TicketStatus.RETURNING, TicketStatus.RETURNING, TicketActor.BUYER, "售后单状态已变更，当前不可回寄"),

    /** 卖家确认收到退货：RETURNING → REFUNDED，退款并回补库存 */
    RECEIVE_RETURN(TicketStatus.RETURNING, TicketStatus.REFUNDED, TicketActor.SELLER, "售后单状态已变更，当前不可确认收货"),

    /** 卖家拒绝售后申请（申请阶段）：APPLYING → REJECTED */
    REJECT(TicketStatus.APPLYING, TicketStatus.REJECTED, TicketActor.SELLER, "售后单状态已变更，当前不可拒绝"),

    /**
     * 卖家拒绝<b>退货退款</b>（退货阶段）：RETURNING → REJECTED，不退款、不回补。
     *
     * <p>开这条边的理由是「同意退货」不是不可撤销的空白支票：卖家同意时只见过买家填的理由，货真退回来才发现
     * 是调包件 / 少件 / 已损毁，此时唯一的选择是继续拒绝——原来只有 APPLYING 能拒（AFS-20），等于把
     * 「验货不通过」逼成「只能确认收货退款」，卖家只能靠不点确认收货拖延，而拖的代价落在买家身上
     * （订单因争议未决不自动完成，见 AFS-43）。买家这边的兜底是申请窗口内重新申请（AFS-04）+ 拒绝理由留痕。
     */
    REJECT_RETURN(TicketStatus.RETURNING, TicketStatus.REJECTED, TicketActor.SELLER, "售后单状态已变更，当前不可拒绝退款"),

    /** 买家撤销售后申请 */
    CLOSE(TicketStatus.APPLYING, TicketStatus.CLOSED, TicketActor.BUYER, "售后单状态已变更，当前不可撤销"),

    /**
     * 系统超时自动同意<b>仅退款</b>：APPLYING → REFUNDED（C11，{@code AfterSaleTimeouts#SELLER_RESPONSE} 到期）。
     * 与手动 {@link #REFUND} 分列而不是复用：时间线的 actor 要说真话（这不是卖家点的），
     * 而副作用走<b>同一个</b> {@code AfterSaleService#refund} 落点，不存在第二套退款逻辑。
     */
    AUTO_REFUND(TicketStatus.APPLYING, TicketStatus.REFUNDED, TicketActor.SYSTEM, "售后单状态已变更，自动同意未执行"),

    /** 系统超时自动同意<b>退货退款</b>：APPLYING → RETURNING（同上，暂不退款，等买家回寄） */
    AUTO_AGREE_RETURN(TicketStatus.APPLYING, TicketStatus.RETURNING, TicketActor.SYSTEM, "售后单状态已变更，自动同意未执行"),

    /**
     * 系统超时自动关闭<b>悬挂回寄</b>：RETURNING → CLOSED（C11，{@code AfterSaleTimeouts#BUYER_RETURN} 到期且买家
     * 始终未填回寄运单号）。转终态即释放「一单一进行中」名额（uk 部分索引随行状态自动让位）并写回订单投影。
     */
    AUTO_CLOSE(TicketStatus.RETURNING, TicketStatus.CLOSED, TicketActor.SYSTEM, "售后单状态已变更，自动关闭未执行"),

    /**
     * 系统超时自动<b>确认收货并退款</b>：RETURNING → REFUNDED（买家已回寄、卖家超
     * {@code AfterSaleTimeouts#SELLER_RECEIVE} 未处理）。与手动 {@link #RECEIVE_RETURN} 分列而同款副作用
     * （走同一个 {@code AfterSaleService#refund} + 同一次回补）：卖家的沉默不能悬着买家的钱，
     * 但时间线要说真话——这不是卖家点的。
     */
    AUTO_RECEIVE(TicketStatus.RETURNING, TicketStatus.REFUNDED, TicketActor.SYSTEM, "售后单状态已变更，自动确认收货未执行");

    private final TicketStatus from;

    private final TicketStatus target;

    private final TicketActor actor;

    private final String conflictMessage;

    TicketAction(TicketStatus from, TicketStatus target, TicketActor actor, String conflictMessage) {
        this.from = from;
        this.target = target;
        this.actor = actor;
        this.conflictMessage = conflictMessage;
    }

    /** 合法前置状态：条件更新（WHERE status = from）的闸门依据；APPLY 为 null（新建） */
    public TicketStatus from() {
        return from;
    }

    /** 本动作的目标状态 */
    public TicketStatus target() {
        return target;
    }

    public TicketActor actor() {
        return actor;
    }

    /** 条件更新抢不到时的 409 文案 */
    public String conflictMessage() {
        return conflictMessage;
    }
}
