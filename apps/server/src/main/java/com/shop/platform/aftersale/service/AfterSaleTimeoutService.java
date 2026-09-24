package com.shop.platform.aftersale.service;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.mapper.TicketMapper;
import com.shop.platform.aftersale.model.AfterSaleTimeouts;
import com.shop.platform.common.Sweep;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 售后超时扫描（C11）：照 {@code OrderTimeoutService} 的机制——扫描本身非事务，逐笔委托
 * {@link AfterSaleService} 的单笔事务落点（跨 bean 调用，@Transactional 才生效）；
 * 落点全是条件更新 + 影响行数判定，抢不到（人工恰好处理了 / 买家刚提交回寄）即让位不计数。
 *
 * <p>三条线都走 {@link Sweep#each}：查询按到期时刻取头部一批，一笔抛异常的行若中断循环，
 * 后面的单每轮都轮不到。隔离与失败日志的口径在那里，三条线共用一份。
 *
 * <p><b>为何不加分布式锁</b>：与订单侧同结论——多实例各扫各的，正确性由条件更新保证，
 * 多扫的代价只是重复 SELECT；等空扫真影响库负载时再上 advisory lock。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AfterSaleTimeoutService {

    /** 单批上限：与订单侧同值（这条同值关系由 {@code SweepTest} 核对，注释说假话会被测出来）。
     *  超时任务是兜底通道，一轮少扫点、30s 后下一轮接着扫，比长占调度线程好 */
    private static final int BATCH_LIMIT = 100;

    private final TicketMapper ticketMapper;

    private final AfterSaleService afterSaleService;

    /** 扫 APPLYING 超 {@link AfterSaleTimeouts#SELLER_RESPONSE}：卖家未处理 → 自动同意。返回真正落成的笔数 */
    public int sweepSellerResponse() {
        return sweep(
                "卖家超时未处理自动同意",
                ticketMapper.selectApplyingExpired(
                        OffsetDateTime.now().minus(AfterSaleTimeouts.SELLER_RESPONSE), BATCH_LIMIT),
                afterSaleService::autoAgree);
    }

    /** 扫 RETURNING 超 {@link AfterSaleTimeouts#BUYER_RETURN} 且未回寄：买家放弃推断 → 自动关闭置 CLOSED */
    public int sweepReturnShip() {
        return sweep(
                "买家超时未回寄自动关闭",
                ticketMapper.selectReturnShipExpired(
                        OffsetDateTime.now().minus(AfterSaleTimeouts.BUYER_RETURN), BATCH_LIMIT),
                afterSaleService::autoCloseReturn);
    }

    /**
     * 扫 RETURNING 且<b>已回寄</b>、超 {@link AfterSaleTimeouts#SELLER_RECEIVE} 卖家未确认收货 → 自动退款并回补。
     * 与上一条靠「运单号是否登记」严格互斥：同一张单不会既被判放弃退货、又被判卖家拖延。
     */
    public int sweepReturnReceive() {
        return sweep(
                "卖家超时未确认收货自动退款",
                ticketMapper.selectReturnReceiveExpired(
                        OffsetDateTime.now().minus(AfterSaleTimeouts.SELLER_RECEIVE), BATCH_LIMIT),
                afterSaleService::autoReceiveReturn);
    }

    /** 一条超时线的落点形状都是「按售后单 id 推进一次」，所以三条线只差在 label 与查询上 */
    private int sweep(String label, List<Ticket> expired, Predicate<UUID> advance) {
        return Sweep.each(log, label, expired, Ticket::getId, ticket -> advance.test(ticket.getId()));
    }
}
