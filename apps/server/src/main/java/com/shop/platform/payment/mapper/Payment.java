package com.shop.platform.payment.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 支付流水 —— 一笔订单的一次支付尝试，存「谁在哪一刻通过什么渠道付了多少钱」。
 *
 * <p>状态机：PENDING → SUCCESS → REFUNDED（已付款订单取消），或 PENDING → FAILED（网关回调失败，
 * 接真实网关后启用）。行可改状态（均走条件转移），但金额/渠道/归属落库后不变。
 * uk_payments_order_success 部分唯一索引保证一单至多一条<b>当下有效</b>的成功流水；
 * 转 REFUNDED 后索引自动放开，但订单此时已 CANCELLED，markPaid 会拒绝再次支付。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("payment.payments")
public class Payment {

    public static final String CHANNEL_MOCK = "MOCK";

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler） */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 订单 ID，orders.orders.id，跨 schema 裸引用不加 FK */
    private UUID orderId;

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

    /** 流水状态：PENDING / SUCCESS / REFUNDED / FAILED，概念归 {@link PaymentStatus} */
    private PaymentStatus status;

    /** 支付成功时刻；PENDING 流水此列为 NULL，确认成功时回填 */
    private OffsetDateTime paidAt;

    /** 退款时刻；与 status = REFUNDED 同时写入（见 V25 迁移） */
    private OffsetDateTime refundedAt;

    /** 渠道侧退款单号：调网关退款受理后回填，对账/客服凭它对得上渠道侧那笔退款 */
    private String refundGatewayNo;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
