package com.shop.platform.logistics.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 物流异常扫描任务：定期找出卡住的包裹并开异常单。
 *
 * <p>与轨迹轮询（推送丢了要补）刻意分开：这是<b>业务判定</b>（多久算卡住），
 * 不是数据获取。两者混在一起改阈值就会连带改轮询节奏。
 *
 * <p>周期取 1 小时：异常判定的最小阈值是 24 小时，一小时一轮足够及时；
 * 阈值本身可调（见 {@code ShipmentIssueType}），重扫是幂等的（未结单唯一索引兜底）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ShipmentIssueScanJob {

    private static final long SCAN_INTERVAL_MS = 3_600_000;

    private final ShipmentIssueService issueService;

    @Scheduled(fixedDelay = SCAN_INTERVAL_MS)
    public void scan() {
        int opened = issueService.scan();
        if (opened > 0) {
            log.info("[LOGISTICS] 异常扫描新开单据 {}", opened);
        }
    }
}
