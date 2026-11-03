package com.shop.platform.logistics.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PagingRules;
import com.shop.platform.fulfillment.api.Carriers;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.logistics.mapper.TraceEventMapper;
import com.shop.platform.logistics.service.TraceIngestService;
import com.shop.platform.logistics.service.TraceIngestService.ManualTrace;
import com.shop.platform.logistics.service.TraceQueryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 轨迹的管理端入口：补录（写）与核对（读）。
 *
 * <p><b>补录能推进包裹到"已签收"并触发订单完成</b>，和推送口同等危险，
 * 所以两道闸门：{@code PACKAGE_TRACK} 权限点 + 平台员工身份——身份就是签名，
 * 不需要承运商那把 HMAC 密钥。
 *
 * <p>录入的是<b>标准码</b>：人已经核实了事实，不需要再过码表翻译。
 * 没接真渠道时，这是本地把整条履约流程跑起来的口子。
 *
 * <p>读侧不写任何东西，所以也走 {@code PACKAGE_TRACK}——能补录的人本来就能看，
 * 再拆一个只读码只多一处会对不上的地方。
 */
@RestController
@RequestMapping("/api/admin/logistics")
public class AdminTraceController {

    private static final int MAX_UNMAPPED = 200;

    /** 码表一次最多回多少行。单家渠道几十到几百行，这个上限只是防止误传大值。 */
    private static final int MAX_CODE_MAP = 2000;

    private final TraceIngestService ingest;
    private final TraceQueryService queries;
    private final Authorizer authorizer;

    public AdminTraceController(TraceIngestService ingest, TraceQueryService queries, Authorizer authorizer) {
        this.ingest = ingest;
        this.queries = queries;
        this.authorizer = authorizer;
    }

    @PostMapping("/traces")
    public Map<String, String> record(@Valid @RequestBody ManualTraceRequest request) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        return Map.of(
                "standardCode",
                ingest.ingestManual(new ManualTrace(
                                request.carrierCode(),
                                request.trackingNo(),
                                parseCode(request.standardCode()),
                                request.note(),
                                request.signedBy(),
                                occurredAt(request)))
                        .dbValue());
    }

    /**
     * 按运单号核对：客服拿着买家报的单号，看我们到底收到过什么轨迹。
     *
     * <p>这是**排查**入口，不是业务入口——看到的和承运商推来的一模一样，含翻成 {@code unknown} 的那些。
     */
    @GetMapping("/packages/by-tracking")
    public TraceQueryService.PackageTimeline byTrackingNo(
            @RequestParam String carrierCode, @RequestParam String trackingNo) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        return queries.byTrackingNo(carrierCode, trackingNo);
    }

    /**
     * 码表缺口清单：最近哪些原始码一直翻不出标准码。
     *
     * <p><b>这是码表维护的线索入口。</b>码表建出来是空的，没有这个清单的话"该补哪条映射"
     * 只能等承运商投诉。
     */
    @GetMapping("/unmapped")
    public List<TraceEventMapper.UnmappedCodeRow> unmapped(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "50") int limit) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        return queries.unmappedCodes(Math.clamp(limit, 1, MAX_UNMAPPED));
    }

    /** 码表现有内容。核对用——只读，改走下面两个写口。 */
    @GetMapping("/code-map")
    public List<TraceEventMapper.MapRow> codeMap(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "100") int limit) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        return queries.mappings(Math.clamp(limit, 1, MAX_CODE_MAP));
    }

    /**
     * 录一条映射（已存在则覆盖）。
     *
     * <p>映射写错会让之后所有同码轨迹翻成错的标准码——猜错"退签"是"签收"就是资损。
     * 所以这里不接受 {@code unknown}：把码映射成 unknown 等于没映射，只会在清单里制造噪音。
     */
    @PutMapping("/code-map")
    public Map<String, String> upsertCodeMap(@Valid @RequestBody CodeMapRequest request) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        StandardTraceCode standard = parseCode(request.standardCode());
        if (standard == StandardTraceCode.UNKNOWN) {
            throw BusinessException.badRequest("不能把原始码映射成 unknown——那等于没映射。要让它翻不出来，删掉这条即可");
        }
        queries.upsertMapping(request.carrierCode(), request.rawCode(), standard, request.note());
        return Map.of(
                "carrierCode",
                Carriers.normalize(request.carrierCode()),
                "rawCode",
                request.rawCode(),
                "standardCode",
                standard.dbValue());
    }

    /** 删一条映射。删掉之后这个原始码会记 {@code unknown} 并出现在缺口清单里。 */
    @DeleteMapping("/code-map")
    public Map<String, Boolean> deleteCodeMap(@RequestParam String carrierCode, @RequestParam String rawCode) {
        authorizer.platform(Permission.PACKAGE_TRACK);
        return Map.of("deleted", queries.deleteMapping(carrierCode, rawCode));
    }

    /** 拼错的标准码当场说清并附全部可选值——补录的人不该翻代码找码表。 */
    static StandardTraceCode parseCode(String standardCode) {
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
     * @param signedBy 签收人，可选。补录 delivered 时如果从电话里问到了是谁签的，填上——
     *     争议时"谁签的字"是买家唯一认的证据
     */
    public record ManualTraceRequest(
            @NotBlank String carrierCode,
            @NotBlank String trackingNo,
            @NotBlank String standardCode,
            @NotBlank String note,
            String signedBy,
            String occurredAt) {}

    /**
     * 录一条码表映射。
     *
     * @param rawCode 承运商原始码，原样存——翻译是拿它做点查，不能归一化（大小写可能就是码的一部分）
     * @param standardCode 翻成哪个标准码。不许是 unknown（那等于没映射）
     * @param note 录码依据：和谁确认的、对方文档哪一页。给后来改码表的人看
     */
    public record CodeMapRequest(
            @NotBlank String carrierCode, @NotBlank String rawCode, @NotBlank String standardCode, String note) {}
}
