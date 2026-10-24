package com.shop.platform.logistics.mapper;

import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@code trace_event} 与 {@code carrier_code_map} 的读写。
 *
 * <p>轨迹是流水，只增不改；幂等的闸门在 {@code uq_trace_natural}
 * (package_id, raw_code, occurred_at)——同一推送重放，INSERT 冲突就是"来过了"。
 */
@Component
public class TraceEventStore {

    private static final String INSERT =
            """
            INSERT INTO logistics.trace_event
                (package_id, carrier_code, tracking_no, raw_code, standard_code, description, occurred_at)
            VALUES (:packageId, :carrierCode, :trackingNo, :rawCode, :standardCode, :description, :occurredAt)
            ON CONFLICT (package_id, raw_code, occurred_at) DO NOTHING
            """;

    private static final String FIND_STANDARD_CODE =
            """
            SELECT standard_code FROM logistics.carrier_code_map
             WHERE carrier_code = :carrierCode AND raw_code = :rawCode
            """;

    private static final String COUNT_BY_PACKAGE =
            "SELECT count(*) FROM logistics.trace_event WHERE package_id = :packageId";

    private static final RowMapper<String> CODE_MAPPER = (rs, i) -> rs.getString(1);

    private final JdbcClient jdbc;

    public TraceEventStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * 落一条轨迹。
     *
     * @return false = (package, 原始码, 时间) 三元组来过了，重放，调用方应当跳过后续推进
     */
    public boolean insert(
            UUID packageId,
            String carrierCode,
            String trackingNo,
            String rawCode,
            StandardTraceCode standard,
            String description,
            Instant occurredAt) {
        return jdbc.sql(INSERT)
                        .param("packageId", packageId)
                        .param("carrierCode", carrierCode)
                        .param("trackingNo", trackingNo)
                        .param("rawCode", rawCode)
                        .param("standardCode", standard.dbValue())
                        .param("description", description)
                        .param("occurredAt", RowMappers.toDb(occurredAt))
                        .update()
                == 1;
    }

    /**
     * 原始码 → 标准码。查不到映射返回 empty，由调用方记 {@code UNKNOWN}——
     * <b>绝不在这里猜</b>：猜错会把"退签"当"签收"，直接触发结算。
     */
    public Optional<StandardTraceCode> translate(String carrierCode, String rawCode) {
        return jdbc.sql(FIND_STANDARD_CODE)
                .param("carrierCode", carrierCode)
                .param("rawCode", rawCode)
                .query(CODE_MAPPER)
                .optional()
                .map(StandardTraceCode::from);
    }

    public int countByPackage(UUID packageId) {
        Integer count = jdbc.sql(COUNT_BY_PACKAGE)
                .param("packageId", packageId)
                .query(Integer.class)
                .single();
        return count == null ? 0 : count;
    }
}
