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
     * 成功流水转退款终态：SUCCESS → REFUNDED 并回填退款时刻、渠道侧退款单号与累计已退额。按 orderId 定位：
     * 调用方（退款监听）只知道订单。条件转移即幂等闸门：重复退款影响 0 行。
     *
     * <p>本批仍是整单全额退（refunded_amount = amount）；批次④改成按退款单多次累计。
     */
    default int refundByOrder(UUID orderId, OffsetDateTime refundedAt, String refundGatewayNo) {
        return update(
                null,
                new LambdaUpdateWrapper<Payment>()
                        .eq(Payment::getOrderId, orderId)
                        .eq(Payment::getStatus, PaymentStatus.SUCCESS)
                        .set(Payment::getStatus, PaymentStatus.REFUNDED)
                        .set(Payment::getRefundedAt, refundedAt)
                        .set(Payment::getRefundGatewayNo, refundGatewayNo)
                        .setSql("refunded_amount = amount"));
    }
}
