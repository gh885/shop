package com.shop.platform.clearing.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 售后冻结的读写。
 *
 * <p>{@code case_id} 是主键，所以同一张售后单重复调 {@code freeze} 只会有一次效果——
 * 幂等靠库，不靠"先查有没有"。
 */
@Component
public class FreezeStore {

    private static final String INSERT =
            """
            INSERT INTO clearing.freeze_item (case_id, seller_order_id, merchant_id, currency, amount, source)
            VALUES (:caseId, :sellerOrderId, :merchantId, :currency, :amount, :source)
            ON CONFLICT (case_id) DO NOTHING
            """;

    private static final String FIND =
            """
            SELECT case_id, seller_order_id, merchant_id, currency, amount, source, status
              FROM clearing.freeze_item
             WHERE case_id = :caseId
            """;

    private static final String CLOSE =
            """
            UPDATE clearing.freeze_item
               SET status = :status, closed_at = now()
             WHERE case_id = :caseId AND status = 'frozen'
            """;

    /**
     * 一个子单还冻着多少钱。订单完成解冻时要用：这部分不能划进可提现，
     * 否则冻着的钱被"二次释放"，商家能把它提走（对账只报告不抹平）。
     * 结算认领那关（DUE_ITEMS 的 NOT EXISTS）已经挡住冻着的明细进批次，
     * 这里是第二道——两道各挡一个入口：认领挡批次，这里挡完成解冻。
     */
    private static final String SUM_OPEN_BY_SELLER_ORDER =
            """
            SELECT COALESCE(SUM(amount), 0) FROM clearing.freeze_item
             WHERE seller_order_id = :sellerOrderId AND status = 'frozen'
            """;

    private static final RowMapper<FreezeRow> MAPPER = RowMappers.of(FreezeRow.class);

    private final JdbcClient jdbc;

    public FreezeStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(UUID caseId, UUID sellerOrderId, UUID merchantId, String currency, long amount, String source) {
        jdbc.sql(INSERT)
                .param("caseId", caseId)
                .param("sellerOrderId", sellerOrderId)
                .param("merchantId", merchantId)
                .param("currency", currency)
                .param("amount", amount)
                .param("source", source)
                .update();
    }

    public Optional<FreezeRow> find(UUID caseId) {
        return jdbc.sql(FIND).param("caseId", caseId).query(MAPPER).optional();
    }

    /** false = 已经不是 frozen（重复解冻，或已经冲销掉了）。 */
    public boolean close(UUID caseId, String status) {
        return jdbc.sql(CLOSE).param("caseId", caseId).param("status", status).update() == 1;
    }

    /** 这个子单未终态冻结之和。订单完成解冻时从净额里扣掉它。 */
    public long sumOpenBySellerOrder(UUID sellerOrderId) {
        Long sum = jdbc.sql(SUM_OPEN_BY_SELLER_ORDER)
                .param("sellerOrderId", sellerOrderId)
                .query(Long.class)
                .single();
        return sum == null ? 0 : sum;
    }

    public record FreezeRow(
            UUID caseId,
            UUID sellerOrderId,
            UUID merchantId,
            String currency,
            long amount,
            String source,
            String status) {}
}
