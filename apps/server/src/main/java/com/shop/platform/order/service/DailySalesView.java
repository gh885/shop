package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

/**
 * 卖家看板的一天销售额：营业日（按平台时区）+ 当日已成交金额。
 *
 * <p>金额用 {@link Money} 而非裸分：与全链路唯一金额类型同口径（见 AGENTS「Money」条），出参形状由契约钉死。
 * 空档日由 service 补零（{@code amount=0} 的 Money），保证图表 x 轴连续、前端不用自己填空洞。
 */
@Schema(name = "DailySalesResponse")
public record DailySalesView(
        @Schema(requiredMode = REQUIRED) LocalDate date, @Schema(requiredMode = REQUIRED) Money amount) {}
