package com.shop.platform.logistics.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.logistics.service.TraceIngestService;
import com.shop.platform.logistics.service.TraceIngestService.ManualTrace;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 人工补录轨迹。**能推进包裹到"已签收"并触发订单完成**，和推送口同等危险，
 * 所以两道闸门：{@code LOGISTICS_MANAGE} 权限点 + 平台员工身份——身份就是签名，
 * 不需要承运商那把 HMAC 密钥。
 *
 * <p>录入的是<b>标准码</b>：人已经核实了事实，不需要再过码表翻译。
 * 没接真渠道时，这是本地把整条履约流程跑起来的口子。
 */
@RestController
@RequestMapping("/api/admin/logistics/traces")
public class AdminTraceController {

    private final TraceIngestService ingest;
    private final Authorizer authorizer;

    public AdminTraceController(TraceIngestService ingest, Authorizer authorizer) {
        this.ingest = ingest;
        this.authorizer = authorizer;
    }

    @PostMapping
    public Map<String, String> record(@Valid @RequestBody ManualTraceRequest request) {
        authorizer.check(Permission.LOGISTICS_MANAGE);
        if (!CurrentOperator.TYPE_STAFF.equals(authorizer.current().operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以补录轨迹");
        }
        return Map.of(
                "standardCode",
                ingest.ingestManual(new ManualTrace(
                                request.carrierCode(),
                                request.trackingNo(),
                                parseCode(request.standardCode()),
                                request.note(),
                                occurredAt(request)))
                        .dbValue());
    }

    /** 拼错的标准码当场说清并附全部可选值——补录的人不该翻代码找码表。 */
    private static StandardTraceCode parseCode(String standardCode) {
        try {
            return StandardTraceCode.from(standardCode);
        } catch (IllegalArgumentException e) {
            throw BusinessException.badRequest("未知标准码: " + standardCode + "，可选："
                    + Arrays.stream(StandardTraceCode.values())
                            .map(StandardTraceCode::dbValue)
                            .toList());
        }
    }

    private static Instant occurredAt(ManualTraceRequest request) {
        if (request.occurredAt() == null || request.occurredAt().isBlank()) {
            return Instant.now();
        }
        try {
            return Instant.parse(request.occurredAt());
        } catch (DateTimeParseException e) {
            throw BusinessException.badRequest("occurredAt 必须是 ISO-8601 时间: " + request.occurredAt());
        }
    }

    /**
     * @param standardCode 八个标准码之一（collected / in_transit / out_for_delivery / delivered /
     *     rejected / returned / exception / unknown）
     * @param note 补录依据，必填——这是给后来查账的人看的证据
     */
    public record ManualTraceRequest(
            @NotBlank String carrierCode,
            @NotBlank String trackingNo,
            @NotBlank String standardCode,
            @NotBlank String note,
            String occurredAt) {}
}
