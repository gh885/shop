package com.shop.platform.aftersale.dto;

import com.shop.platform.common.NoteFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 卖家拒绝退款入参：<b>理由必填</b>（AFS-30）。
 *
 * <p>为什么不容忍空手拒绝：拒绝是把买家推到「重新申请或认了」的终局决定，理由是他唯一能拿到下一步该怎么做
 * 的信息；也是日后判定责任唯一的留痕。落点是 {@code aftersale.refunds.reject_reason}，与长度同宽。
 */
public record RejectRefundRequest(
        @NotBlank(message = "请填写拒绝理由")
                @Size(max = NoteFieldRules.FREE_TEXT_MAX, message = "拒绝理由最长 " + NoteFieldRules.FREE_TEXT_MAX + " 字")
                String reason) {}
