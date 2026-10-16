package com.shop.platform.rum.dto;

import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * 遥测问题列表入参（GET /admin/rum/issues 的 query）。
 *
 * <p>不给时间窗就是**最近 24 小时**，不是「全部」：这张表按保留期滚动删除，真按全部聚合等于
 * 每次翻页都全表扫一遍——而排查要回答的第一个问题就是「刚才怎么了」。
 */
public record AdminRumIssueQuery(
        @Size(max = RumFieldRules.APP_MAX) String app,
        @Size(max = RumFieldRules.KIND_MAX) String kind,
        OffsetDateTime from,
        OffsetDateTime to) {}
