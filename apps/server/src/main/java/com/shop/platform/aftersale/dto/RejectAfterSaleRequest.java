package com.shop.platform.aftersale.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 卖家拒绝售后入参：<b>理由必填</b>（AFS-30）。
 *
 * <p>为什么不容忍空手拒绝：拒绝是把买家推到「重新申请或认了」的终局决定，理由是他唯一能拿到下一步该
 * 怎么做的信息；也是日后判定责任（尤其已寄回又被打回的单）唯一的留痕。
 *
 * <p>长度 200 与落点 {@code ticket_events.note} 同宽——不另开列，也就不会出现截断后两处不一致。
 */
public record RejectAfterSaleRequest(
        @NotBlank(message = "请填写拒绝理由") @Size(max = 200, message = "拒绝理由最长 200 字") String reason) {}
