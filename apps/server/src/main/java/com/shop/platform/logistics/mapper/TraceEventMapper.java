package com.shop.platform.logistics.mapper;

import com.shop.platform.fulfillment.api.StandardTraceCode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * {@code trace_event} 与 {@code carrier_code_map} 的读写。
 *
 * <p>轨迹是流水，只增不改；幂等的闸门在 {@code uq_trace_natural}
 * (package_id, raw_code, occurred_at)——同一推送重放，INSERT 冲突就是"来过了"。
 *
 * <p><b>读侧按 {@code package_id}，不按运单号。</b>运单号反查要回 fulfillment（模块边界：
 * 本模块只许依赖 {@code fulfillment :: api}），而调用方拿到的包裹视图里已经有 packageId。
 */
@Mapper
public interface TraceEventMapper {

    /** 时间线投影。一次返回整条轨迹，不翻页——单个包裹的轨迹条数十级到几十级。 */
    String TIMELINE_COLUMNS =
            "id, carrier_code, tracking_no, raw_code, standard_code, description, location, occurred_at";

    /**
     * 落一条轨迹。
     *
     * @return false = (package, 原始码, 时间) 三元组来过了，重放，调用方应当跳过后续推进
     */
    @Insert(
            """
            INSERT INTO logistics.trace_event
                (package_id, carrier_code, tracking_no, raw_code, standard_code, description, location, occurred_at)
            VALUES (#{packageId}, #{carrierCode}, #{trackingNo}, #{rawCode}, #{standardCode}, #{description},
                    #{location}, #{occurredAt})
            ON CONFLICT (package_id, raw_code, occurred_at) DO NOTHING
            """)
    boolean insert(
            @Param("packageId") UUID packageId,
            @Param("carrierCode") String carrierCode,
            @Param("trackingNo") String trackingNo,
            @Param("rawCode") String rawCode,
            @Param("standardCode") StandardTraceCode standardCode,
            @Param("description") String description,
            @Param("location") String location,
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

    /**
     * 一个包裹的完整时间线，按发生时刻倒序（最新在前，买家直接看到"现在到哪了"）。
     *
     * <p>不做归属校验：调用方拿到的是已经过归属链路的包裹。轨迹本身不是范围表
     * （行永远由包裹带出，不单独暴露），{@code DataScopeTest} 的清单里也没有它。
     */
    @Select("SELECT " + TIMELINE_COLUMNS
            + " FROM logistics.trace_event WHERE package_id = #{packageId} ORDER BY occurred_at DESC, id DESC")
    List<TraceRow> findByPackageInternal(@Param("packageId") UUID packageId);

    /**
     * 最近落库的 {@code unknown} 轨迹：码表缺哪条映射，看这里。
     *
     * <p>**这是码表维护的唯一线索入口。** 码表建出来是空的、也只会靠 SQL 录，
     * 那就必须有人能看见"哪些原始码一直翻不出来"——否则补映射只能靠承运商投诉。
     * 按 (carrier, raw_code) 聚合去重，一眼看到缺的是哪几条。
     */
    @Select(
            """
            SELECT carrier_code, raw_code, count(*) AS occurrences, max(occurred_at) AS last_seen_at
              FROM logistics.trace_event
             WHERE standard_code = 'unknown'
             GROUP BY carrier_code, raw_code
             ORDER BY max(occurred_at) DESC
             LIMIT #{limit}
            """)
    List<UnmappedCodeRow> findUnmappedCodes(@Param("limit") int limit);

    /** 时间线一行。{@code standardCode} 按枚举反解，库里存的是小写枚举名。 */
    record TraceRow(
            UUID id,
            String carrierCode,
            String trackingNo,
            String rawCode,
            StandardTraceCode standardCode,
            String description,
            @Schema(nullable = true) String location,
            Instant occurredAt) {}

    /** 一条翻不出来的原始码：缺的是 {@code (carrierCode, rawCode) → ?} 这一行映射。 */
    record UnmappedCodeRow(String carrierCode, String rawCode, int occurrences, Instant lastSeenAt) {}

    // ── 码表维护 ──────────────────────────────────────────────────────────────
    //
    // 码表是数据不是代码（接真渠道时逐码确认后录入），所以必须有维护入口——
    // 只能靠 SQL 录的表在实际运维里等于没有。写入口的爆炸半径是「以后所有同码轨迹的翻译」，
    // 所以它只对 LOGISTICS_MANAGE 开放，且不许写 unknown（映射到 unknown 等于没映射）。

    /**
     * 录一条映射。同一 (承运商, 原始码) 已存在则覆盖——录错了要能改，
     * 而不是"删掉再建"（那中间会有一个查不到映射的窗口）。
     */
    @Insert(
            """
            INSERT INTO logistics.carrier_code_map (carrier_code, raw_code, standard_code, note)
            VALUES (#{carrierCode}, #{rawCode}, #{standardCode}, #{note})
            ON CONFLICT (carrier_code, raw_code)
            DO UPDATE SET standard_code = EXCLUDED.standard_code, note = EXCLUDED.note
            """)
    void upsertMap(
            @Param("carrierCode") String carrierCode,
            @Param("rawCode") String rawCode,
            @Param("standardCode") StandardTraceCode standardCode,
            @Param("note") String note);

    /** 删一条映射，返回 false = 本来就没有。 */
    @Delete("DELETE FROM logistics.carrier_code_map WHERE carrier_code = #{carrierCode} AND raw_code = #{rawCode}")
    boolean deleteMap(@Param("carrierCode") String carrierCode, @Param("rawCode") String rawCode);

    /** 码表现有内容，按承运商排。不翻页——单家渠道的码表是几十到几百行，一次看完才能核对。 */
    @Select(
            """
            SELECT carrier_code, raw_code, standard_code, note
              FROM logistics.carrier_code_map
             ORDER BY carrier_code, raw_code
             LIMIT #{limit}
            """)
    List<MapRow> findMappings(@Param("limit") int limit);

    /** 码表一行。 */
    record MapRow(String carrierCode, String rawCode, StandardTraceCode standardCode, String note) {}
}
