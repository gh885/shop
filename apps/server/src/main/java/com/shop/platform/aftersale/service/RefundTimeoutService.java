package com.shop.platform.aftersale.service;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.model.AfterSaleTimeouts;
import com.shop.platform.common.Sweep;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 退款的三条超时线（AFS-23）：卖家审核（48h 自动同意）、买家回寄（7 天未登记自动关闭）、
 * 卖家收货（10 天未确认自动退款）。
 *
 * <p>扫一批到期行 → 逐笔交给 {@link RefundService}（不同 bean，{@code @Transactional} 才生效），
 * 逐笔经 {@link Sweep#each} 做失败隔离：一笔炸了只丢那一笔，下一轮重扫它——否则一笔稳定抛异常的头部行
 * 会把整条超时线卡死。无分布式锁，并发安全靠条件更新（{@code WHERE status = 前置态}）做闸门；
 * 人工恰好处理了就让位。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RefundTimeoutService {

    /** 每批至多几笔：与订单侧 {@code OrderTimeoutService} 同值，由 {@code SweepTest} 核对 */
    private static final int BATCH_LIMIT = 100;

    private final RefundMapper refundMapper;

    private final RefundService refundService;

    /** 待处理超 48h：卖家未处置 → 自动同意。返回真正落成的笔数 */
    public int sweepSellerResponse() {
        List<Refund> expired = refundMapper.selectExpiredPending(
                OffsetDateTime.now().minus(AfterSaleTimeouts.SELLER_RESPONSE), BATCH_LIMIT);
        return sweep("退款卖家审核超时自动同意", expired, r -> refundService.autoAgree(r.getId()));
    }

    /** 待寄回超 7 天且始终没填回寄运单号 → 自动关闭（释放「同一订单行」的名额，窗口内可重新申请） */
    public int sweepReturnShip() {
        List<Refund> expired = refundMapper.selectExpiredReturnPending(
                OffsetDateTime.now().minus(AfterSaleTimeouts.BUYER_RETURN), BATCH_LIMIT);
        return sweep("退款买家回寄超时自动关闭", expired, r -> refundService.autoCloseReturn(r.getId()));
    }

    /** 已寄回超 10 天：卖家未确认收货 → 自动退款并回补（与人工确认收货同一落点） */
    public int sweepReturnReceive() {
        List<Refund> expired = refundMapper.selectExpiredReturned(
                OffsetDateTime.now().minus(AfterSaleTimeouts.SELLER_RECEIVE), BATCH_LIMIT);
        return sweep("退款卖家收货超时自动退款", expired, r -> refundService.autoReceiveReturn(r.getId()));
    }

    private int sweep(String label, List<Refund> expired, java.util.function.Predicate<Refund> advance) {
        return Sweep.each(log, label, expired, Refund::getId, advance);
    }
}
