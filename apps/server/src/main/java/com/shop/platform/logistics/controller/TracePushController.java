package com.shop.platform.logistics.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.service.TraceIngestService;
import com.shop.platform.logistics.service.TraceIngestService.TracePush;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Objects;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * 承运商轨迹推送入口。
 *
 * <p><b>必须免登录</b>（承运商没有我们的令牌），安全全靠 HMAC 签名——
 * 这条口子能推进包裹到"已签收"并触发订单完成与结算解冻，
 * 没有签名它就是一个任何人都能按的"打钱按钮"。密钥没配时全部拒绝，fail closed。
 *
 * <p>收原始体再自己解析：验签对象必须是进来的字节原样，先反序列化成对象再拼回去，
 * 字段顺序和转义就都变了。响应 {@code {"standardCode":"..."}}——回执告诉渠道翻到了哪一档，
 * {@code unknown} 不算失败，渠道不必重投。
 */
@RestController
@RequestMapping("/api/logistics/carriers")
public class TracePushController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final TraceIngestService ingest;

    public TracePushController(TraceIngestService ingest) {
        this.ingest = Objects.requireNonNull(ingest, "ingest");
    }

    @PostMapping("/{carrierCode}/traces")
    public Map<String, String> push(
            @PathVariable String carrierCode,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestBody String rawBody) {
        TracePush push = parse(carrierCode, rawBody);
        return Map.of("standardCode", ingest.ingest(push, signature).dbValue());
    }

    private static TracePush parse(String carrierCode, String rawBody) {
        TraceBody body;
        try {
            body = JSON.readValue(rawBody, TraceBody.class);
        } catch (RuntimeException e) {
            throw BusinessException.badRequest("轨迹推送不是合法 JSON");
        }
        Instant occurredAt;
        try {
            occurredAt = Instant.parse(text("occurredAt", body.occurredAt()));
        } catch (DateTimeParseException e) {
            throw BusinessException.badRequest("occurredAt 必须是 ISO-8601 时间: " + body.occurredAt());
        }
        return new TracePush(
                carrierCode,
                text("trackingNo", body.trackingNo()),
                text("code", body.code()),
                body.description(),
                occurredAt,
                rawBody);
    }

    /** occurredAt 先按字符串收，解析失败才能回一句带原值的 400。 */
    private record TraceBody(String trackingNo, String code, String description, String occurredAt) {}

    private static String text(String key, String value) {
        if (value == null || value.isBlank()) {
            throw BusinessException.badRequest("轨迹推送缺少 " + key);
        }
        return value;
    }
}
