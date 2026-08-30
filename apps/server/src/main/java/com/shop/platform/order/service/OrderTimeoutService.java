package com.shop.platform.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderMapper;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 超时扫描：按 {@link OrderTimeout} 逐条规则扫到期单（非事务），逐笔委托
 * {@link OrderTransitionService} 的单笔事务落点。两者分属不同 bean，规避 Spring 自调用导致 @Transactional 失效；
 * 单笔事务短，扫到大批也不拖长事务。
 *
 * <p><b>为何不加分布式锁</b>：多实例部署时每个实例各自起扫，但落点都是条件更新 + 影响行数判定，
 * 同一笔订单只有一个实例能抢到，余者返回 false 直接让位——<b>正确性不依赖锁</b>，多扫的代价仅是
 * 重复的 SELECT（部分索引命中、批上限 {@value #BATCH_LIMIT} 行）。等空扫真影响库负载时再上锁，且优先
 * {@code pg_try_advisory_xact_lock}（事务结束自动释放、实例崩溃无残留锁），不自建锁表背 TTL 兼顾。
 */
@Service
@RequiredArgsConstructor
public class OrderTimeoutService {

    /** 单批上限：各部分索引全集有限，分批跑防任务线程长事务 */
    private static final int BATCH_LIMIT = 100;

    private final OrderMapper orderMapper;

    private final OrderTransitionService transitions;

    /** 扫一条超时线，返回真正落成的笔数（与并发的买家/卖家动作竞态时让位的不计） */
    public int sweep(OrderTimeout rule) {
        List<Order> expired = orderMapper.selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getStatus, rule.from())
                .lt(rule.expireColumn(), OffsetDateTime.now())
                .orderByAsc(rule.expireColumn())
                .last("LIMIT " + BATCH_LIMIT));
        int handled = 0;
        for (Order order : expired) {
            if (rule.handle(transitions, order)) {
                handled++;
            }
        }
        return handled;
    }
}
