package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 退款执行记录 —— 退款单每一次向支付渠道发起的调用，append-only。
 *
 * <p>重试不改变退款单状态，只追加一条记录；成功与否、渠道流水号、请求/响应原文都留在这里，
 * 对账与客服排查以它为准（§4.5）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("aftersale.refund_executions")
public class RefundExecution extends BaseEntity {

    /** 所属退款单，aftersale.refunds.id */
    private UUID refundId;

    private Long amount;

    private String currency;

    /** 本次渠道调用是否成功 */
    private boolean success;

    /** 向渠道发出的请求原文 */
    private String requestPayload;

    /** 渠道原文响应 */
    private String responsePayload;

    /** 渠道侧退款单号（成功或受理时回填） */
    private String gatewayRefundNo;

    /** 失败原因（成功时为空） */
    private String errorMessage;

    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }
}
