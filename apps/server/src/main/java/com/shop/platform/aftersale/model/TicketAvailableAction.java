package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Set;

/**
 * 售后可执行动作 —— 状态机出边（{@link TicketAction} 转移表）∩ 角色权限，也是售后按钮组的唯一真相。
 *
 * <p>照订单侧 {@code OrderAvailableAction} 的模式：动作集由后端算好随列表/详情契约下发
 * （{@code TicketResponse.availableActions} / {@code SellerTicketItem.availableActions}），
 * 前端只保留文案与展示顺序，不再按状态复刻一遍按钮表（两处真相必然漂移）。
 *
 * <p>与 {@link TicketAction} 的关系是<b>多对一映射</b>：一个界面动作可以对应转移表里的多条边——
 * 「同意」按售后类型落在 REFUND 或 AGREE_RETURN 上，买家看到的就是一个按钮。超时自动动作
 * （AUTO_*，actor=SYSTEM）刻意不在这里出现：那是定时器吃的词表，不是给人点的按钮。
 */
@Schema(enumAsRef = true)
public enum TicketAvailableAction {

    /** 撤销申请（买家，仅 APPLYING；底层转移 TicketAction.CLOSE） */
    CANCEL(TicketAction.CLOSE),

    /** 填/改退货物流（买家，仅 RETURNING；可重复提交，覆盖旧运单） */
    RETURN_GOODS(TicketAction.RETURN_GOODS),

    /**
     * 重新申请（买家）：不是本单上的转移，而是<b>再开一张新单</b>——能否重来吃的是订单申请窗口与
     * 「最新单非已退款」闸门（AFS-04/05），只有知道订单的服务侧能算出这个谓词，故不走 {@link #usableFrom}。
     */
    REAPPLY,

    /** 同意售后（卖家，仅 APPLYING；按类型落 REFUND 或 AGREE_RETURN，两个方向一个按钮） */
    AGREE(TicketAction.REFUND, TicketAction.AGREE_RETURN),

    /** 拒绝售后（卖家，仅 APPLYING） */
    REJECT(TicketAction.REJECT),

    /** 确认收到退货（卖家，仅 RETURNING；此时才退款并回补库存） */
    RECEIVE_RETURN(TicketAction.RECEIVE_RETURN);

    /** 本动作背后的转移表行；REAPPLY 为空（它不由本单状态推导） */
    private final Set<TicketAction> transitions;

    TicketAvailableAction(TicketAction... transitions) {
        this.transitions = Set.of(transitions);
    }

    /** 买家视角的动作全集与声明序（列表按此序下发，响应体要稳定） */
    private static final List<TicketAvailableAction> BUYER = List.of(CANCEL, RETURN_GOODS, REAPPLY);

    /** 卖家视角的动作全集 */
    private static final List<TicketAvailableAction> SELLER = List.of(AGREE, REJECT, RECEIVE_RETURN);

    /**
     * 买家视角当前可执行的动作。
     *
     * @param reapplyAllowed 重新申请资格：售后单自己看不见订单的申请窗口，由 service 经 order :: api
     *                       算好传入（终态且窗口未过才有）；本单已退款时一律不给——
     *                       与 {@code AfterSaleService#apply} 的 REFUNDED 闸门（AFS-05）同一口径，
     *                       调用方算错也不会下发一个点了必吃 409 的按钮
     */
    public static List<TicketAvailableAction> buyerActions(TicketStatus status, boolean reapplyAllowed) {
        return BUYER.stream()
                .filter(action -> action == REAPPLY
                        ? reapplyAllowed && status != TicketStatus.REFUNDED
                        : action.usableFrom(status))
                .toList();
    }

    /** 卖家视角当前可执行的动作（工作台行与详情共用；终态返回空） */
    public static List<TicketAvailableAction> sellerActions(TicketStatus status) {
        return SELLER.stream().filter(action -> action.usableFrom(status)).toList();
    }

    /** 本动作在当前状态下是否可用：转移表里存在一条 from = 当前态的出边 */
    private boolean usableFrom(TicketStatus status) {
        return transitions.stream().anyMatch(action -> action.from() == status);
    }
}
