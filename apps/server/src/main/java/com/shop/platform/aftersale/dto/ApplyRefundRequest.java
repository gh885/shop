package com.shop.platform.aftersale.dto;

import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.NoteFieldRules;
import com.shop.platform.common.Quantities;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 申请退款入参：类型 + 原因 + 逐行数量。
 *
 * <p>{@code type} 与 {@code reasonCode} 直接声明为枚举：非法值由消息转换器挡在 400，不必在 service 里手写解析；
 * 原因枚举是必选（AFS-10）——七天无理由强制只认 {@link AfterSaleReason#NO_REASON}，自由文本读不出这个结论。
 *
 * <p>{@code lines} 是行级退款的核心：每条只给订单行与数量，<b>金额由服务端算</b>。上限沿用一单最多几行
 * （{@link Quantities#ORDER_LINES_MAX}），它不是新口径，是同一张订单的行数上界。
 */
public record ApplyRefundRequest(
        @NotNull(message = "请选择退款类型") RefundType type,
        @NotNull(message = "请选择售后原因") AfterSaleReason reasonCode,
        @Size(max = NoteFieldRules.FREE_TEXT_MAX, message = "补充说明最长 " + NoteFieldRules.FREE_TEXT_MAX + " 字")
                String reason,
        @NotEmpty(message = "请选择要退款的商品")
                @Size(max = Quantities.ORDER_LINES_MAX, message = "一次退款最多 " + Quantities.ORDER_LINES_MAX + " 行")
                @Valid
                List<RefundLineRequest> lines) {}
