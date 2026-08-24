package com.shop.platform.payment.mapper;

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
 * 支付流水 —— 一笔订单的一次成功支付，存"谁在哪一刻通过什么渠道付了多少钱"。
 *
 * <p>V1 MOCK 渠道发起即成功，行只插不改（无 updated_at）；接真实网关后扩展 PENDING/FAILED 状态机，
 * uk_payments_order_success 部分唯一索引始终保证一单至多一条成功流水。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("payment.payments")
public class Payment {

    public static final String STATUS_SUCCESS = "SUCCESS";

    public static final String CHANNEL_MOCK = "MOCK";

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler） */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 订单 ID，orders.orders.id，跨 schema 裸引用不加 FK */
    private UUID orderId;

    /** 冗余单号：对账时人可读，免回查订单表 */
    private String orderNo;

    /** 支付发起人，auth.users.id，裸引用不加 FK */
    private UUID userId;

    /** 支付金额，分（= 订单 pay_amount，service 落库前已按订单投影校验） */
    private Long amount;

    /** 币种（如 CNY），与 amount 组成 Money */
    private String currency;

    /** 支付渠道：V1 恒 MOCK；网关化后 MOCK/WECHAT/ALIPAY */
    private String channel;

    /** 流水状态：V1 恒 SUCCESS；网关化后扩展 PENDING/FAILED/REFUNDED */
    private String status;

    /** 支付成功时刻；网关化后 PENDING 流水此列为 NULL */
    private OffsetDateTime paidAt;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
