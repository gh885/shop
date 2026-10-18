package com.shop.platform.payment.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PaymentMapper extends BaseMapper<Payment> {

    /** 订单的成功支付流水：幂等短路与写入冲突回退共用（uk_payments_order_success 保证至多一条） */
    default Payment selectSuccessByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, PaymentStatus.SUCCESS));
    }

    /** 订单最早的待确认流水：重复发起时复用同一笔，避免一单堆积多条 PENDING */
    default Payment selectPendingByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, PaymentStatus.PENDING)
                .orderByAsc(Payment::getCreatedAt)
                .last("LIMIT 1"));
    }

    /** 一次支付批次（trade_id）下的全部流水：整批发起/确认与幂等回读 */
    default List<Payment> selectByTrade(UUID tradeId) {
        return selectList(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getTradeId, tradeId)
                .orderByAsc(Payment::getCreatedAt));
    }

    /**
     * 确认用的乐观闸门：条件转移 PENDING→SUCCESS，一条语句同时写定状态、成功时刻与渠道交易号，防重复确认；
     * 返回影响行数。
     *
     * @param gatewayTradeNo 渠道侧交易号；MOCK 渠道没有渠道凭据，传 null
     */
    default int confirmSuccess(UUID paymentId, OffsetDateTime paidAt, String gatewayTradeNo) {
        return update(
                null,
                new LambdaUpdateWrapper<Payment>()
                        .eq(Payment::getId, paymentId)
                        .eq(Payment::getStatus, PaymentStatus.PENDING)
                        .set(Payment::getStatus, PaymentStatus.SUCCESS)
                        .set(Payment::getPaidAt, paidAt)
                        .set(Payment::getGatewayTradeNo, gatewayTradeNo));
    }

    /**
     * 成功流水累计一笔退款：{@code refunded_amount += 本次}，退满即转 REFUNDED 并回填退款时刻与渠道单号。
     *
     * <p>条件更新即闸门：{@code refunded_amount + 本次 ≤ amount} 不成立就 0 行，调用方 409 回滚整张退款单；
     * 部分退款留在 SUCCESS（「退了多少」由金额列表达），只有退满才改变状态——一张支付退三次也不会提前变成
     * REFUNDED，避免支付侧谎报「整笔已退」。
     *
     * <p>状态列在 SQL 里按金额算，而不是两次 UPDATE：中间态（金额已加、状态没转）在并发确认下会被读到。
     */
    default int applyRefund(UUID paymentId, long amount, OffsetDateTime refundedAt, String gatewayRefundNo) {
        return update(
                null,
                new LambdaUpdateWrapper<Payment>()
                        .eq(Payment::getId, paymentId)
                        .eq(Payment::getStatus, PaymentStatus.SUCCESS)
                        .apply("refunded_amount + {0} <= amount", amount)
                        .setSql("refunded_amount = refunded_amount + " + amount)
                        .setSql("status = CASE WHEN refunded_amount + " + amount
                                + " = amount THEN 'REFUNDED' ELSE 'SUCCESS' END")
                        .set(Payment::getRefundedAt, refundedAt)
                        .set(Payment::getRefundGatewayNo, gatewayRefundNo));
    }
}
