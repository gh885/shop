package com.shop.platform.logistics.infra.kdniao;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.service.CarrierPush;
import com.shop.platform.logistics.service.CarrierPushReceiver;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 快递鸟推送接收（验签 + 解析）。
 *
 * <p>验签对<b>原始字符串</b>做摘要：推送报文里的 {@code RequestData} 是对方签名的原文，
 * 先反序列化再拼回去会因字段顺序/空格差异导致摘要不一致——这是接入外部推送最常见的坑。
 *
 * <p>未配置密钥时一律拒绝（fail-close）：没有密钥就无法验签，而"没验签就落库"等于把轨迹写入权
 * 开放给任何能访问该端点的人。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class KdniaoPushReceiver implements CarrierPushReceiver {

    private final KdniaoProperties props;

    private final ObjectMapper objectMapper;

    @Override
    public CarrierPush receive(String carrierCode, String requestData, String dataSign) {
        if (!StringUtils.hasText(props.getAppKey())) {
            throw BusinessException.forbidden("物流推送未启用");
        }
        if (!KdniaoSign.verify(requestData, dataSign, props.getAppKey())) {
            log.warn("[LOGISTICS] 推送验签失败, carrierCode={}", carrierCode);
            throw BusinessException.forbidden("签名校验失败");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(requestData);
        } catch (JacksonException e) {
            // 验签过了但报文不是合法 JSON（对方拼装 bug）：400 说明责任在报文，不落进兜底 500
            throw BusinessException.badRequest("推送报文格式错误");
        }
        String trackingNo = root.path("LogisticCode").asString("");
        if (!StringUtils.hasText(trackingNo)) {
            throw BusinessException.badRequest("推送报文缺少运单号");
        }
        List<CarrierTrackingNode> nodes = KdniaoTraces.parse(root);
        return new CarrierPush(trackingNo, nodes);
    }
}
