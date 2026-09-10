package com.shop.platform.logistics.controller;

import com.shop.platform.logistics.dto.CarrierPushRequest;
import com.shop.platform.logistics.service.TrackingPushService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 承运商轨迹推送接收。<b>匿名可达</b>（不在鉴权过滤器的 skip 名单外也不该带用户令牌——推送方是外部系统）。
 *
 * <p>安全边界完全靠签名：{@code requestData + appKey} 的摘要由对方生成，我们比对
 * （见 {@code infra.kdniao.KdniaoPushReceiver}）。未配置密钥时一律 403——没有密钥就没法验签，
 * 而"没验签就落库"等于把轨迹写入权限开放给任何能访问这个路径的人。
 *
 * <p>返回 200 即视为已受理：找不到包裹也返回成功，否则对方会按重试策略反复推一个我们永远处理不了的报文。
 */
@Tag(name = "logistics-webhooks", description = "承运商轨迹推送")
@RestController
@RequestMapping("/logistics/webhooks")
@RequiredArgsConstructor
public class CarrierWebhookController {

    private final TrackingPushService trackingPushService;

    /** 接收推送：验签 → 解析 → 按运单号找包裹 → 归一化落库（去重与单调推进在落库路径里） */
    @PostMapping("/{carrierCode}")
    public void receivePush(@PathVariable String carrierCode, @Valid @RequestBody CarrierPushRequest req) {
        trackingPushService.accept(carrierCode, req.requestData(), req.dataSign());
    }
}
