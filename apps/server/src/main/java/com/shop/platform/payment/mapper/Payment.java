package com.shop.platform.payment.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.BaseEntity;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 支付流水 —— 一笔订单的一次支付尝试，存「谁在哪一刻通过什么渠道付了多少钱」。
 *
 * <p>状态机：PENDING → SUCCESS → REFUNDED（已付款订单取消），或 PENDING → FAILED（网关回调失败，
 * 接真实网关后启用）。行可改状态（均走条件转移），但金额/渠道/归属落库后不变。
 * uk_payments_order_success 部分唯一索引保证一单至多一条<b>当下有效</b>的成功流水；
 * 转 REFUNDED 后索引自动放开，但订单此时已 CANCELLED，markPaid 会拒绝再次支付。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("payment.payments")
public class Payment extends BaseEntity {

    public static final String CHANNEL_MOCK = "MOCK";

    public static final String CHANNEL_ALIPAY = "ALIPAY";

    /** 订单 ID，orders.orders.id，跨 schema 裸引用不加 FK */
    private UUID orderId;

    /**
     * 结算归组键，= orders.orders.checkout_key：一次多店结算的 N 条流水共享同一值，供收银台整批发起/确认。
     * 逐单支付（订单列表补付、单店）留 NULL。落库后不变，非第二写者列。
     */
    private UUID checkoutKey;

    /** 冗余单号：对账时人可读，免回查订单表 */
    private String orderNo;

    /** 支付发起人，account.users.id，裸引用不加 FK */
    private UUID userId;

    /** 支付金额，分（= 订单 pay_amount，service 落库前已按订单投影校验） */
    private Long amount;

    /** 币种（如 CNY），与 amount 组成 Money */
    private String currency;

    /** 支付渠道：V1 恒 MOCK；网关化后 MOCK/WECHAT/ALIPAY */
    private String channel;

    /**
     * 流水状态：PENDING / SUCCESS / REFUNDED / FAILED，概念归 {@link PaymentStatus}。
     *
     * <p>回写永不带这一列（插入要带：发起支付落初始态 PENDING）：状态只经 {@code PaymentMapper.confirmSuccess} /
     * {@code refundByOrder} 的条件转移改。{@code confirmSuccess} 一条 UPDATE 同时落 PENDING→SUCCESS 与
     * {@code paidAt}，没有确认后再 {@code updateById} 的路径，故整行回写也不该把状态重写一遍。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private PaymentStatus status;

    /** 支付成功时刻；PENDING 流水此列为 NULL，确认成功时回填 */
    private OffsetDateTime paidAt;

    /** 渠道侧交易号（支付宝 trade_no）：确认成功时由渠道查询结果回填，对账 / 退款 / 客服凭它对齐渠道那一笔 */
    private String gatewayTradeNo;

    /** 退款时刻；与 status = REFUNDED 同时写入（见 V25 迁移） */
    private OffsetDateTime refundedAt;

    /** 渠道侧退款单号：调网关退款受理后回填，对账/客服凭它对得上渠道侧那笔退款 */
    private String refundGatewayNo;

    /** 派生视图：金额列 + 币种列配对成 Money，只读转换不落库（非表字段） */
    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }

    /**
     * 收银台跳转地址：发起支付时由渠道生成、随响应一次性下发，<b>不落库</b>。
     *
     * <p>同一笔 PENDING 流水每次发起都能重新生成（渠道侧 out_trade_no 不变，地址可重复下单），
     * 存下来只会多一份可能过期的副本。MOCK 渠道没有跳转，此列为 null。
     */
    @TableField(exist = false)
    private String payUrl;
}
