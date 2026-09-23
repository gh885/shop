package com.shop.platform.logistics.service;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 轨迹轮询兜底任务 —— 推送之外的第二条获取路径。
 *
 * <p>为什么推送之外还要轮询：推送会丢（对方故障、网络、我们的端点升级期间），
 * 而轨迹是买家天天盯的东西，丢一条就有一条轨迹永远停在那儿。轮询扫"还该有动静但久没动静"的包裹。
 *
 * <p>扫的是<b>停滞</b>而非全量：条件 = 未到终态 且 最后一条节点（没有节点则取发货时刻）早于阈值。
 * 这样已在途但一直没更新的单每轮都会被捞出来，而刚更新过的不会重复拉——省的是对方的配额。
 *
 * <p>网关不可用（未配置密钥）直接返回，不空转、不报错：本地开发不该被这个任务刷屏。
 * 与超时扫描同一条哲学：单笔失败只记日志，正确性由下一轮重试保证，不靠任务本身"一次成功"。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class TrackingPollJob {

    /** 扫描间隔 5 分钟：轨迹不是秒级业务，够了；也避开对方接口的频率限制 */
    private static final long POLL_INTERVAL_MS = 300_000;

    /** 停滞阈值 6 小时：正常中转节奏内没更新的才算"该有动静"，避免每轮把在途单全拉一遍 */
    private static final Duration STALE_AFTER = Duration.ofHours(6);

    /** 单轮上限：一个包裹一次查询，别让一轮扫描把配额打满 */
    private static final int BATCH_LIMIT = 50;

    /**
     * 单轮时间预算：用完就收尾，剩下的下一轮再捞。
     *
     * <p>不设这道闸时，网关按连接超时逐个拖满就是几分钟——全部 @Scheduled 共用一条调度线程池，
     * 一个慢任务能把 30s 一档的超时关单扫描挤掉（超期单一直占着冻结库存）。停滞阈值本身是小时级，
     * 晚几轮不影响正确性，本来就有「下一轮重试」的兜底语义。
     */
    private static final Duration ROUND_BUDGET = Duration.ofSeconds(60);

    private final CarrierTrackingGateway gateway;

    private final TrackingSyncService trackingSyncService;

    private final ShipmentMapper shipmentMapper;

    @Scheduled(fixedDelay = POLL_INTERVAL_MS)
    public void poll() {
        if (!gateway.available()) {
            return;
        }
        OffsetDateTime staleBefore = OffsetDateTime.now().minus(STALE_AFTER);
        List<Shipment> stale = shipmentMapper.selectStaleForPolling(staleBefore, BATCH_LIMIT);
        if (stale.isEmpty()) {
            return;
        }
        long deadline = System.nanoTime() + ROUND_BUDGET.toNanos();
        int polled = 0;
        int recorded = 0;
        for (Shipment shipment : stale) {
            if (System.nanoTime() - deadline >= 0) {
                break;
            }
            recorded += trackingSyncService.sync(shipment);
            polled++;
        }
        log.info("[LOGISTICS] 轮询轨迹, 命中={}, 本轮已查={}, 新增节点={}", stale.size(), polled, recorded);
    }
}
