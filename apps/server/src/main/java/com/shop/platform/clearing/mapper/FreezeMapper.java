package com.shop.platform.clearing.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 售后冻结的读写。
 *
 * <p>{@code case_id} 是主键，所以同一张售后单重复调 {@code freeze} 只会有一次效果——
 * 幂等靠库，不靠"先查有没有"。
 */
@Mapper
public interface FreezeMapper {

    @Insert(
            """
            INSERT INTO clearing.freeze_item (case_id, seller_order_id, merchant_id, currency, amount, source)
            VALUES (#{caseId}, #{sellerOrderId}, #{merchantId}, #{currency}, #{amount}, #{source})
            ON CONFLICT (case_id) DO NOTHING
            """)
    void insert(
            @Param("caseId") UUID caseId,
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("merchantId") UUID merchantId,
            @Param("currency") String currency,
            @Param("amount") long amount,
            @Param("source") String source);

    @Select(
            """
            SELECT case_id, seller_order_id, merchant_id, currency, amount, source, status
              FROM clearing.freeze_item
             WHERE case_id = #{caseId}
            """)
    Optional<FreezeRow> find(@Param("caseId") UUID caseId);

    /** false = 已经不是 frozen（重复解冻，或已经冲销掉了）。 */
    @Update(
            """
            UPDATE clearing.freeze_item
               SET status = #{status}, closed_at = now()
             WHERE case_id = #{caseId} AND status = 'frozen'
            """)
    boolean close(@Param("caseId") UUID caseId, @Param("status") String status);

    /**
     * 这个子单未终态冻结之和。订单完成解冻时从净额里扣掉它。
     *
     * <p>一个子单还冻着多少钱。订单完成解冻时要用：这部分不能划进可提现，
     * 否则冻着的钱被"二次释放"，商家能把它提走（对账只报告不抹平）。
     * 结算认领那关（{@code dueItems} 的 NOT EXISTS）已经挡住冻着的明细进批次，
     * 这里是第二道——两道各挡一个入口：认领挡批次，这里挡完成解冻。
     */
    @Select(
            """
            SELECT COALESCE(SUM(amount), 0) FROM clearing.freeze_item
             WHERE seller_order_id = #{sellerOrderId} AND status = 'frozen'
            """)
    long sumOpenBySellerOrder(@Param("sellerOrderId") UUID sellerOrderId);

    record FreezeRow(
            UUID caseId,
            UUID sellerOrderId,
            UUID merchantId,
            String currency,
            long amount,
            String source,
            String status) {}
}
