package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 子订单履约状态机 —— 只管「货走到哪」，支付生死归主订单 {@link TradeStatus}。
 *
 * <p>词表（docs/domain/order-model.md §5.2）：待发货 PAID → 部分发货 → 已发货 → 已完成；旁支 已取消。
 * 子订单随下单创建即处于 PAID（待发货），{@code paid_at} 为空表示还没收到钱，此时禁止发货；
 * 没有独立的「待付款」态——未支付这件事由主订单状态表达。
 *
 * <p>转移表是唯一真相：{@link #sourcesOf} 供条件更新反推合法前态，{@link #buyerActions()} /
 * {@link #sellerActions()} 供前端按钮组渲染。履约态允许回退（退货会让结清量下降），
 * 最终以批次③的 {@code FulfillmentRecalcService} 从事实重算为准；本表的箭头只表示层级，不表示单向。
 *
 * <p>DB 列存 {@code name()}（varchar 列 + MyBatis 默认 EnumTypeHandler）。
 */
@Schema(enumAsRef = true)
public enum OrderStatus {

    /** 待发货（子订单创建即进入此态；paid_at 为空时禁止发货） */
    PAID,

    /** 部分发货（有行已结清、仍有行未结清） */
    PARTIALLY_SHIPPED,

    /** 已发货（全部订单行已结清，等签收） */
    SHIPPED,

    /** 已完成（履约闭环终点） */
    COMPLETED,

    /** 已取消/关闭 */
    CANCELLED;

    /**
     * 状态图（源态 → 目标态）：合法转移的唯一真相。
     *
     * <p><b>履约态允许回退</b>（docs/domain/order-model.md §8）：取消已发出的包裹会把结清量退回去，
     * 于是「已发货 → 部分发货 → 待发货」都是重算的合法结果。箭头表示层级与可达性，不表示单向；
     * 重算的唯一入口是 {@code FulfillmentRecalcService}，它按行账本算出目标态，不手写箭头。
     *
     * <p>自环保留在表里（部分发货再发一批、已发货再落一个包裹），条件更新本来就认这些起点。
     */
    private static final Map<OrderStatus, Set<OrderStatus>> TRANSITIONS = Map.of(
            PAID, Set.of(PARTIALLY_SHIPPED, SHIPPED, CANCELLED),
            PARTIALLY_SHIPPED, Set.of(PAID, PARTIALLY_SHIPPED, SHIPPED),
            SHIPPED, Set.of(PAID, PARTIALLY_SHIPPED, SHIPPED, COMPLETED),
            COMPLETED, Set.of(),
            CANCELLED, Set.of());

    private static final Map<OrderStatus, Set<OrderStatus>> SOURCES = TRANSITIONS.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> TRANSITIONS.entrySet().stream()
                    .filter(other -> other.getValue().contains(e.getKey()))
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toSet())));

    private static final Set<OrderStatus> BUYER_ACTION_TARGETS = Set.of(CANCELLED, COMPLETED);

    private static final Set<OrderStatus> SELLER_ACTION_TARGETS = Set.of(SHIPPED);

    /** 能转移到 target 的全部源状态：条件更新（WHERE status IN (...)）的合法前置集 */
    public static Set<OrderStatus> sourcesOf(OrderStatus target) {
        return SOURCES.getOrDefault(target, Set.of());
    }

    /** 买家视角当前可执行的动作（列表/详情按钮组渲染用）；终态返回空 */
    public List<OrderAvailableAction> buyerActions() {
        return actionsFor(BUYER_ACTION_TARGETS);
    }

    /** 卖家视角当前可执行的动作（发货作业按钮用） */
    public List<OrderAvailableAction> sellerActions() {
        return actionsFor(SELLER_ACTION_TARGETS);
    }

    /**
     * 某角色在当前态可执行的动作：当前态的出边 ∩ 角色允许的目标，按枚举声明序给出。
     *
     * <p>顺序不是业务需要，但响应体必须稳定：集合的迭代顺序会让同一份数据两次请求给出不同 JSON，
     * 契约快照与前端 diff 都受不了。
     */
    private List<OrderAvailableAction> actionsFor(Set<OrderStatus> roleTargets) {
        Set<OrderStatus> targets = TRANSITIONS.getOrDefault(this, Set.of());
        return Arrays.stream(OrderAvailableAction.values())
                .filter(action -> targets.contains(action.target()) && roleTargets.contains(action.target()))
                .toList();
    }
}
