package com.shop.platform.logistics.mapper;

import com.shop.platform.fulfillment.api.StandardTraceCode;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * {@code trace_event} 与 {@code carrier_code_map} 的读写。
 *
 * <p>轨迹是流水，只增不改；幂等的闸门在 {@code uq_trace_natural}
 * (package_id, raw_code, occurred_at)——同一推送重放，INSERT 冲突就是"来过了"。
 */
@Mapper
public interface TraceEventMapper {

    /**
     * 落一条轨迹。
     *
     * @return false = (package, 原始码, 时间) 三元组来过了，重放，调用方应当跳过后续推进
     */
    @Insert(
            """
            INSERT INTO logistics.trace_event
                (package_id, carrier_code, tracking_no, raw_code, standard_code, description, occurred_at)
            VALUES (#{packageId}, #{carrierCode}, #{trackingNo}, #{rawCode}, #{standardCode}, #{description}, #{occurredAt})
            ON CONFLICT (package_id, raw_code, occurred_at) DO NOTHING
            """)
    boolean insert(
            @Param("packageId") UUID packageId,
            @Param("carrierCode") String carrierCode,
            @Param("trackingNo") String trackingNo,
            @Param("rawCode") String rawCode,
            @Param("standardCode") StandardTraceCode standardCode,
            @Param("description") String description,
            @Param("occurredAt") Instant occurredAt);

    /**
     * 原始码 → 标准码。查不到映射返回 empty，由调用方记 {@code UNKNOWN}——
     * <b>绝不在这里猜</b>：猜错会把"退签"当"签收"，直接触发结算。
     */
    default Optional<StandardTraceCode> translate(String carrierCode, String rawCode) {
        return findStandardCode(carrierCode, rawCode).map(StandardTraceCode::from);
    }

    @Select(
            """
            SELECT standard_code FROM logistics.carrier_code_map
             WHERE carrier_code = #{carrierCode} AND raw_code = #{rawCode}
            """)
    Optional<String> findStandardCode(@Param("carrierCode") String carrierCode, @Param("rawCode") String rawCode);

    @Select("SELECT count(*) FROM logistics.trace_event WHERE package_id = #{packageId}")
    int countByPackage(@Param("packageId") UUID packageId);
}
