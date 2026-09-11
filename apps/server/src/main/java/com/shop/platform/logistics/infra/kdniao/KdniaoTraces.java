package com.shop.platform.logistics.infra.kdniao;

import com.shop.platform.logistics.service.CarrierTrackingNode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;

/**
 * 快递鸟 Traces 数组的公共解析：主动查询与推送的报文里 {@code State + Traces[{AcceptTime, AcceptStation, Location}]}
 * 结构完全相同，解析只留一份。
 */
@Slf4j
final class KdniaoTraces {

    private KdniaoTraces() {}

    /** 解析 Traces 数组；时间解析不出来的条目 occurredAt 为 null（落库前会被跳过，不用错时刻推进状态） */
    static List<CarrierTrackingNode> parse(JsonNode root) {
        String rawState = root.path("State").asString("");
        List<CarrierTrackingNode> nodes = new ArrayList<>();
        for (JsonNode trace : root.path("Traces")) {
            nodes.add(new CarrierTrackingNode(
                    rawState,
                    trace.path("AcceptStation").asString(""),
                    trace.path("Location").asString(""),
                    parseTime(trace.path("AcceptTime").asString(""))));
        }
        return nodes;
    }

    /** 时间按对方格式解析；解析不了就返回 null */
    private static OffsetDateTime parseTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(raw.replace(' ', 'T') + "+08:00");
        } catch (RuntimeException e) {
            log.warn("[LOGISTICS] 无法解析承运商时间, 原文={}", raw);
            return null;
        }
    }
}
