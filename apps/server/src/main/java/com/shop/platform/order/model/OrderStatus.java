package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 订单履约主状态机 —— 本模块状态规则的唯一真相，单路径流转：
 * 待付款 → 待发货 → 已发货 → 已完成；待付款/待发货可取消。完成之后的交易纠葛走 {@link AfterSaleStatus}。
 *
 * <p>一张 {@link #TRANSITIONS} 派生两类消费：{@link #sourcesOf(OrderStatus)} 供条件更新反推合法前态
 * （WHERE status IN (...)），{@link #buyerActions()} / {@link #sellerActions()} 供前端按钮组渲染
 * （动作名本身是 {@link OrderAvailableAction}）。
 * 转移表放静态字段而非构造器参数：枚举常量的构造器参数里非法前向引用后声明的常量。
 *
 * <p>DB 列存 {@code name()}（varchar 列 + MyBatis 默认 EnumTypeHandler）。
 */
@Schema(enumAsRef = true)
public enum OrderStatus {

    /** 待付款 */
    PENDING_PAYMENT,

    /** 待发货 */
    PAID,

    /** 已发货 */
    SHIPPED,

    /** 已完成（履约闭环终点） */
    COMPLETED,

    /** 已取消/关闭 */
    CANCELLED;

    /**
     * 状态图（源态 → 目标态）：合法转移的唯一真相。
     *
     * <p>SHIPPED 的自环是<b>多包裹追加发货</b>：已发货单再落一个包裹时状态不变（SHIPPED → SHIPPED），
     * 但它是合法转移——{@code OrderMapper.markShippedReturningPrevious} 的条件更新本来就认
     * {@code status IN ('PAID','SHIPPED')}，这张表与那道闸门是同一份事实的两个投影。
     * 自环同时让 {@link #sellerActions()} 在 SHIPPED 态继续派生 SHIP（按钮语义 = 「追加包裹」）。
     */
    private static final Map<OrderStatus, Set<OrderStatus>> TRANSITIONS = Map.of(
            PENDING_PAYMENT, Set.of(PAID, CANCELLED),
            PAID, Set.of(SHIPPED, CANCELLED),
            SHIPPED, Set.of(COMPLETED, SHIPPED),
            COMPLETED, Set.of(),
            CANCELLED, Set.of());

    /**
     * 目标态 → 源态集（{@link #TRANSITIONS} 反向投影）。
     *
     * <p>集中掉 {@code sourcesOf} 每次调用都全表 stream + 收集的浪费：状态机常量在枚举初始化期算一次，
     * 而每笔状态转移（下单/取消/发货/确认）都会调它——把它从「每次扫描」降为「查表」。
     */
    private static final Map<OrderStatus, Set<OrderStatus>> SOURCES = TRANSITIONS.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> TRANSITIONS.entrySet().stream()
                    .filter(other -> other.getValue().contains(e.getKey()))
                    .map(Map.Entry::getKey)
                    .collect(Collectors.toSet())));

    private static final Set<OrderStatus> BUYER_ACTION_TARGETS = Set.of(PAID, CANCELLED, COMPLETED);

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
