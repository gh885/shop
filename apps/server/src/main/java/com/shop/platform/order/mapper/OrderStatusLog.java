package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 订单状态审计流水 —— 每次状态转移追加一行，append-only，不回放不修改。
 *
 * <p>单一履约维度（主状态机单路径）用订单上的时间戳列够用；叠加售后动作后一次「申请 → 同意/拒绝/撤销」
 * 有多个动作，时间戳列记不下中间过程，必须靠这张账本回放历史。它不表达「哪些转移合法」
 * （那是 order.model 两个状态机枚举的事），只负责「谁在何时把状态从 A 改到 B、因为什么」。
 *
 * <p>三列取值都是 {@code name()}：{@code fromStatus} / {@code toStatus} 来自
 * {@code OrderStatus} 或 {@code AfterSaleStatus}（同一行必属同一状态机，写入口 OrderStatusLogWriter 的泛型约束保证），
 * {@code action} 来自 {@code OrderAction}，{@code actorType} 来自 {@code OrderActor}。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("orders.order_status_log")
public class OrderStatusLog {

    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属订单，orders.orders.id */
    private UUID orderId;

    /** 转移前状态；首动作（下单落库）可空 */
    private String fromStatus;

    /** 转移后状态 */
    private String toStatus;

    /** 动作（OrderAction 的 name） */
    private String action;

    /** 发起方（OrderActor 的 name） */
    private String actorType;

    /** 理由：取消原因 / 售后理由 / 自动处理固定文案 */
    private String reason;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
