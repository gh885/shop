package com.shop.platform.order.dto;

import com.shop.platform.common.NoteFieldRules;
import jakarta.validation.constraints.Size;

/** 买家取消订单入参：原因可选，超时关单由系统写固定文案不走此入口 */
public record CancelOrderRequest(
        @Size(max = NoteFieldRules.FREE_TEXT_MAX, message = "取消原因最多 " + NoteFieldRules.FREE_TEXT_MAX + " 字")
                String reason) {}
