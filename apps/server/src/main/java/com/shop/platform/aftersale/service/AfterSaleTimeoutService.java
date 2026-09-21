package com.shop.platform.aftersale.service;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.mapper.TicketMapper;
import com.shop.platform.aftersale.model.AfterSaleTimeouts;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 售后超时扫描（C11）：照 {@code OrderTimeoutService} 的机制——扫描本身非事务，逐笔委托
 * {@link AfterSaleService} 的单笔事务落点（跨 bean 调用，@Transactional 才生效）；
 * 落点全是条件更新 + 影响行数判定，抢不到（人工恰好处理了 / 买家刚提交回寄）即让位不计数。
 *
 * <p><b>为何不加分布式锁</b>：与订单侧同结论——多实例各扫各的，正确性由条件更新保证，
 * 多扫的代价只是重复 SELECT；等空扫真影响库负载时再上 advisory lock。
 */
@Service
@RequiredArgsConstructor
public class AfterSaleTimeoutService {

    /** 单批上限：与订单侧同值。超时任务是兜底通道，一轮少扫点、30s 后下一轮接着扫，比长占调度线程好 */
    private static final int BATCH_LIMIT = 100;

    private final TicketMapper ticketMapper;

    private final AfterSaleService afterSaleService;

    /** 扫 APPLYING 超 {@link AfterSaleTimeouts#SELLER_RESPONSE}：卖家未处理 → 自动同意。返回真正落成的笔数 */
    public int sweepSellerResponse() {
        List<Ticket> expired = ticketMapper.selectApplyingExpired(
                OffsetDateTime.now().minus(AfterSaleTimeouts.SELLER_RESPONSE), BATCH_LIMIT);
        int handled = 0;
        for (Ticket ticket : expired) {
            if (afterSaleService.autoAgree(ticket.getId())) {
                handled++;
            }
        }
        return handled;
    }

    /** 扫 RETURNING 超 {@link AfterSaleTimeouts#BUYER_RETURN} 且未回寄：买家放弃推断 → 自动关闭置 CLOSED */
    public int sweepReturnShip() {
        List<Ticket> expired = ticketMapper.selectReturnShipExpired(
                OffsetDateTime.now().minus(AfterSaleTimeouts.BUYER_RETURN), BATCH_LIMIT);
        int handled = 0;
        for (Ticket ticket : expired) {
            if (afterSaleService.autoCloseReturn(ticket.getId())) {
                handled++;
            }
        }
        return handled;
    }
}
