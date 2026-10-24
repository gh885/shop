package com.shop.platform.logistics.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.logistics.mapper.TraceEventMapper;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 轨迹摄取：验签 → 定位包裹 → 落原始轨迹 → 翻码 → 回写履约状态。
 *
 * <p>顺序有意为之：<b>先落原始再推进</b>。翻译或推进炸了，原始轨迹已经在
 * {@code trace_event} 里，重推或人工处理有据可查；反过来先推进再落库，
 * 中间一断就是"状态动了但没有任何轨迹证据"。
 *
 * <p>幂等的闸门是 {@code uq_trace_natural}：同一 (包裹, 原始码, 时间) 重放，
 * INSERT 冲突直接返回，连 {@code recordTrace} 都不会被调——这就是
 * fulfillment.md 给 recordTrace 定的输入契约。
 *
 * <p><b>为什么不像 payment 的回调那样回 failure 让渠道重投：</b> 签名错是攻击或配置错，
 * 重投救不了；运单不存在是数据问题，重投也救不了。只有"我方暂时性故障"值得让渠道重试，
 * 而那种情况这里抛异常，HTTP 层自然回 5xx，渠道按自己的重试策略再来。
 */
@Component
public class TraceIngestService {

    private static final Logger log = LoggerFactory.getLogger(TraceIngestService.class);

    private final TraceEventMapper traces;
    private final FulfillmentCommand fulfillment;
    private final String pushSecret;

    public TraceIngestService(
            TraceEventMapper traces,
            FulfillmentCommand fulfillment,
            @Value("${shop.logistics.push-secret:}") String pushSecret) {
        this.traces = traces;
        this.fulfillment = fulfillment;
        this.pushSecret = pushSecret;
    }

    /**
     * 摄取一条推送。
     *
     * @return 翻译后的标准码（unknown 也在内），给响应方回执用
     * @throws com.shop.platform.common.BusinessException 签名不过 403；运单查不到 404
     */
    @Transactional
    public StandardTraceCode ingest(TracePush push, String timestampMillis, String signatureHex) {
        if (!TraceSignature.verify(pushSecret, push.rawBody(), timestampMillis, signatureHex)) {
            // 不带原因：验签失败的细节是给攻击者的提示，日志里也不需要——原始体都在手里
            log.warn("轨迹推送验签失败: carrier={} trackingNo={}", push.carrierCode(), push.trackingNo());
            throw BusinessException.forbidden("LOGISTICS_BAD_SIGNATURE", "轨迹推送验签失败");
        }

        var pkg = fulfillment
                .findByTrackingNo(push.carrierCode(), push.trackingNo())
                .orElseThrow(
                        () -> BusinessException.notFound("运单不存在: " + push.carrierCode() + " " + push.trackingNo()));

        StandardTraceCode standard =
                traces.translate(push.carrierCode(), push.code()).orElse(StandardTraceCode.UNKNOWN);
        if (standard == StandardTraceCode.UNKNOWN) {
            // 不是错误：码表没录全就是常态，记下来等人补映射，状态不动
            log.info("轨迹码查无映射，记 unknown：carrier={} raw={}", push.carrierCode(), push.code());
        }

        if (!traces.insert(
                pkg.packageId(),
                push.carrierCode(),
                push.trackingNo(),
                push.code(),
                standard,
                push.description(),
                push.occurredAt())) {
            // 重放：这一条来过了，推进那次也已经做过，什么都不再动
            return standard;
        }

        fulfillment.recordTrace(pkg.packageId(), standard, push.occurredAt());
        return standard;
    }

    /**
     * 人工补录轨迹：客服/运营确认了事实（"电话核实已签收"），手工喂进<b>同一条管道</b>
     * ——落 {@code trace_event}、走 {@code recordTrace}，和承运商推送没有第二条路。
     *
     * <p>不查码表：<b>人就是翻译</b>，录入的已经是标准码；{@code raw_code} 记标准码本身，
     * 证据链不断。没接真渠道时，这个入口就是本地把"发货 → 运输 → 签收 → 订单完成"
     * 整条流程跑起来的口子；接了之后它是推送丢失时的人工兜底。
     *
     * @throws com.shop.platform.common.BusinessException 运单查不到 404
     */
    @Transactional
    public StandardTraceCode ingestManual(ManualTrace trace) {
        var pkg = fulfillment
                .findByTrackingNo(trace.carrierCode(), trace.trackingNo())
                .orElseThrow(
                        () -> BusinessException.notFound("运单不存在: " + trace.carrierCode() + " " + trace.trackingNo()));

        if (!traces.insert(
                pkg.packageId(),
                trace.carrierCode(),
                trace.trackingNo(),
                trace.code().dbValue(),
                trace.code(),
                trace.note(),
                trace.occurredAt())) {
            // 同 (包裹, 码, 时间) 来过了：推进那次已经做过
            return trace.code();
        }

        fulfillment.recordTrace(pkg.packageId(), trace.code(), trace.occurredAt());
        return trace.code();
    }

    /** 一次人工补录。@param note 补录依据，给人看的证据（"电话核实已签收"）。 */
    public record ManualTrace(
            String carrierCode, String trackingNo, StandardTraceCode code, String note, Instant occurredAt) {

        public ManualTrace {
            Objects.requireNonNull(carrierCode, "carrierCode");
            Objects.requireNonNull(trackingNo, "trackingNo");
            Objects.requireNonNull(code, "code");
            Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }

    /**
     * 一次轨迹推送。
     *
     * @param rawBody 原始请求体——验签对象，必须是进来的字节原样
     */
    public record TracePush(
            String carrierCode,
            String trackingNo,
            String code,
            String description,
            Instant occurredAt,
            String rawBody) {

        public TracePush {
            Objects.requireNonNull(carrierCode, "carrierCode");
            Objects.requireNonNull(trackingNo, "trackingNo");
            Objects.requireNonNull(code, "code");
            Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }
}
