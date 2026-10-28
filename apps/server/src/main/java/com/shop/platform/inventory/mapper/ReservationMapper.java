package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.ReservationStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code reservation} 的写入与点查。
 *
 * <p>状态推进一律是带前置条件的 UPDATE：影响 0 行不是"没事"，而是当前状态和你以为的不一样。
 * 调用方必须拿 {@link #find} 回查一次当前状态再决定——直接跳过是最容易埋进去的 bug。
 *
 * <p>{@code quantity} 不可变，{@link #shipPartial} 只加 {@code shipped_quantity}。
 * 剩余预占永远由 {@code quantity - shipped_quantity} 算出来，不存第三个数。
 */
@Mapper
public interface ReservationMapper {

    String COLUMNS = "id, sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no, quantity,"
            + " shipped_quantity, status, expires_at";

    /** 撞 {@code uq_reservation_line} 说明这一行已经预占过，调用方要处理重复下单。 */
    @Insert(
            """
            INSERT INTO inventory.reservation
                (sku_id, warehouse_id, merchant_id, order_group_id, seller_order_id, line_no,
                 quantity, status, expires_at)
            VALUES (#{row.skuId}, #{row.warehouseId}, #{row.merchantId}, #{row.orderGroupId}, #{row.sellerOrderId},
                    #{row.lineNo}, #{row.quantity}, 'reserved', #{row.expiresAt})
            """)
    void insert(@Param("row") Reservation row);

    @Select("SELECT " + COLUMNS
            + " FROM inventory.reservation WHERE seller_order_id = #{sellerOrder} AND line_no = #{lineNo}")
    Optional<Reservation> findByLine(@Param("sellerOrder") UUID sellerOrderId, @Param("lineNo") int lineNo);

    /** 一批子单的全部预占。整单 commit/release 用它一次取回，省掉逐行点查。 */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM inventory.reservation
             WHERE seller_order_id IN
            <foreach collection="sellerOrderIds" item="sellerOrderId" open="(" separator="," close=")">#{sellerOrderId}</foreach>
            </script>
            """)
    List<Reservation> findBySellerOrders(@Param("sellerOrderIds") List<UUID> sellerOrderIds);

    /** false = 当前状态不是 {@code from}，别人先改了。 */
    @Update(
            """
            UPDATE inventory.reservation SET status = #{to}
             WHERE id = #{id} AND status = #{from}
            """)
    boolean advance(@Param("id") UUID id, @Param("from") ReservationStatus from, @Param("to") ReservationStatus to);

    /**
     * 出库推进：已出库量加 {@code qty}，发完就转 {@code consumed}。
     *
     * <p><b>状态与计数在同一条 UPDATE 里推进</b>，不留两个可以互相漂的地方。
     * 「发了一部分」不单独占一个状态值——它由 {@code shipped_quantity > 0} 判定，
     * 多一个状态值就多一处会漂的地方，而这个事实只能有一个来源。
     *
     * <p>前置条件 {@code status = 'committed'} 挡两件事：未付款不能发、已释放/已耗尽的预占不能再出库。
     * {@code shipped_quantity + qty <= quantity} 挡超发。
     *
     * @return false = 状态不对或会超发，调用方必须回滚并告警（说明订单侧允许了不该允许的发货）
     */
    @Update(
            """
            UPDATE inventory.reservation
               SET shipped_quantity = shipped_quantity + #{qty},
                   status = CASE WHEN shipped_quantity + #{qty} = quantity THEN 'consumed' ELSE status END
             WHERE id = #{id}
               AND status = 'committed'
               AND shipped_quantity + #{qty} <= quantity
            """)
    boolean shipPartial(@Param("id") UUID id, @Param("qty") int quantity);

    /** 超时兜底：只捞还挂着且已过期的，每批限量。 */
    @Select(
            "SELECT " + COLUMNS
                    + """
              FROM inventory.reservation
             WHERE status = 'reserved' AND expires_at < now()
             ORDER BY expires_at
             LIMIT #{limit}
            """)
    List<Reservation> findExpired(@Param("limit") int limit);

    public record Reservation(
            UUID id,
            UUID skuId,
            UUID warehouseId,
            UUID merchantId,
            UUID orderGroupId,
            UUID sellerOrderId,
            int lineNo,
            int quantity,
            int shippedQuantity,
            ReservationStatus status,
            Instant expiresAt) {

        /** 剩余可出库量。 */
        public int remaining() {
            return quantity - shippedQuantity;
        }

        /** 待落库的一条：{@code id} 交给库生成，此时还没有状态。 */
        public static Reservation pending(
                UUID skuId,
                UUID warehouseId,
                UUID merchantId,
                UUID orderGroupId,
                UUID sellerOrderId,
                int lineNo,
                int quantity,
                Instant expiresAt) {
            return new Reservation(
                    null,
                    skuId,
                    warehouseId,
                    merchantId,
                    orderGroupId,
                    sellerOrderId,
                    lineNo,
                    quantity,
                    0,
                    ReservationStatus.RESERVED,
                    expiresAt);
        }
    }
}
