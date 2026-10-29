package com.shop.platform.inventory.mapper;

import com.shop.platform.inventory.model.Stock;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * {@code stock} 的全部写入。
 *
 * <p>这里没有任何"先查再改"：三个变动方法都是单条条件 UPDATE + {@code RETURNING}，影响 0 行就是前置条件不成立，
 * 由调用方决定抛异常还是回滚。查和改之间的窗口就是超卖，一条 SQL 把它关掉。
 *
 * <p>{@code RETURNING} 只给改后的值。改前的值由操作语义反推（扣 n 件之前就是多 n 件），
 * 不要为了拿 before 再查一次——那会引入新的竞态。
 *
 * <p><b>命名参数而不是 {@code ?}。</b> 原来 {@code ship} 那条把四个 {@code quantity} 和两个主键混在同一个
 * 位置序列里，写反了编译器不报、测试也未必覆盖得到，账却静默错位。改成 {@code :qty} / {@code :sku} 之后，
 * 名字对不上当场抛异常。
 *
 * <p>{@code RETURNING} 带上 {@code sku_id} 和 {@code warehouse_id}：它们是查询条件本身，值不变，
 * 但带出来才能让整行映射成 {@link Stock} 这一个类型——守恒式校验在它的构造器里，多一层适配器就等于绕过校验。
 */
@Mapper
public interface StockMapper {

    String COLUMNS = "sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety";

    String RETURNING = "RETURNING " + COLUMNS;

    @Select("SELECT " + COLUMNS + " FROM inventory.stock WHERE sku_id = #{sku} AND warehouse_id = #{wh}")
    Optional<Stock> find(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId);

    /**
     * 锁住这一行再读。
     *
     * <p>只有 {@code adjust} 用它：它要拿改前的值写流水。调整是商家低频动作，没有超卖风险；
     * 下单路径永远不许用这个。
     */
    @Select("SELECT " + COLUMNS + " FROM inventory.stock WHERE sku_id = #{sku} AND warehouse_id = #{wh} FOR UPDATE")
    Optional<Stock> lock(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId);

    /** 首次建档。已有行就撞主键，调用方必须先 {@link #lock}。 */
    @Select(
            """
            INSERT INTO inventory.stock
                (sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety)
            VALUES (#{row.skuId}, #{row.warehouseId}, #{row.merchantId}, #{row.onHand}, #{row.availableToPromise}, 0, #{row.safety})
            """
                    + RETURNING)
    Stock insert(@Param("row") Stock stock);

    /**
     * 覆盖实物与安全库存，可售由守恒式反推：{@code available_to_promise = on_hand - reserved - safety}。
     *
     * <p>反推而不是让调用方传 {@code available_to_promise}：传两个数就有两个数对不上的可能，反推只有一个真相。
     */
    @Select(
            """
            UPDATE inventory.stock
               SET on_hand   = #{onHand},
                   safety    = #{safety},
                   available_to_promise = #{onHand} - reserved - #{safety},
                   updated_at = now()
             WHERE sku_id = #{sku} AND warehouse_id = #{wh}
            """
                    + RETURNING)
    Stock adjust(
            @Param("sku") UUID skuId,
            @Param("wh") UUID warehouseId,
            @Param("onHand") int onHand,
            @Param("safety") int safety);

    /** 下单预占：可售减、预占加。{@code available_to_promise >= n} 就是"够不够卖"的唯一判据。 */
    @Select(
            """
            UPDATE inventory.stock
               SET available_to_promise = available_to_promise - #{qty},
                   reserved  = reserved + #{qty},
                   updated_at = now()
             WHERE sku_id = #{sku} AND warehouse_id = #{wh} AND available_to_promise >= #{qty}
            """
                    + RETURNING)
    Optional<Stock> reserve(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId, @Param("qty") int quantity);

    /** 释放：预占减、可售加。{@code reserved >= n} 挡住重复释放。 */
    @Select(
            """
            UPDATE inventory.stock
               SET available_to_promise = available_to_promise + #{qty},
                   reserved  = reserved - #{qty},
                   updated_at = now()
             WHERE sku_id = #{sku} AND warehouse_id = #{wh} AND reserved >= #{qty}
            """
                    + RETURNING)
    Optional<Stock> release(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId, @Param("qty") int quantity);

    /**
     * 批查：这些 SKU 各有多少可售，<b>只看这一个仓</b>。
     *
     * <p>交易口径：下单只从默认仓发货，所以详情页的「有货 / 售罄」必须问同一个仓。
     * 拿全仓求和来判，会出现「页面显示有 5，下单说不够」。
     *
     * <p>查不到的 SKU 不出现在结果里（不返回 0 行），调用方按 0 处理——
     * 「没建过库存行」和「卖光了」在展示上是同一件事，但在数据上是两件事，
     * 让调用方自己决定怎么呈现。
     */
    @Select(
            """
            <script>
            SELECT sku_id AS skuId, available_to_promise AS available
              FROM inventory.stock
             WHERE warehouse_id = #{wh}
               AND sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<SkuAvailable> availableOfWarehouse(@Param("skuIds") Collection<UUID> skuIds, @Param("wh") UUID warehouseId);

    /**
     * 批查：这些 SKU 各有多少可售，<b>跨仓求和</b>。商家列表的「我还有多少货」用它。
     *
     * <p><b>与 {@link #availableOfWarehouse} 的口径不同，这是有意的。</b> 那个只看默认仓，
     * 因为下单路径只从默认仓发货；这条求和所有仓，因为商家要问的是「我总共还有多少」。
     * 两个问题不同，答案自然不同。
     */
    @Select(
            """
            <script>
            SELECT sku_id AS skuId, sum(available_to_promise)::int AS available
              FROM inventory.stock
             WHERE sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
             GROUP BY sku_id
            </script>
            """)
    List<SkuAvailable> sumAvailableBySkuIds(@Param("skuIds") Collection<UUID> skuIds);

    /** 批查的一行。 */
    record SkuAvailable(UUID skuId, int available) {}

    /** 批查四科目：商家库存页要看见的不只是可售量。 */
    @Select(
            """
            <script>
            SELECT sku_id       AS skuId,
                   on_hand      AS onHand,
                   available_to_promise AS availableToPromise,
                   reserved     AS reserved,
                   safety       AS safety
              FROM inventory.stock
             WHERE warehouse_id = #{wh}
               AND sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    List<StockRow> accountsOfWarehouse(@Param("skuIds") Collection<UUID> skuIds, @Param("wh") UUID warehouseId);

    /** 四科目的一行。 */
    record StockRow(UUID skuId, int onHand, int availableToPromise, int reserved, int safety) {}

    /**
     * 出库：预占减、实物减，可售不动——"还能卖几件"在预占那一刻就减过了。
     *
     * <p>{@code qty} 可以小于这一行的预占量（分批发货）。剩余预占由 {@code reservation.shipped_quantity}
     * 记，这里只管账。
     */
    @Select(
            """
            UPDATE inventory.stock
               SET reserved = reserved - #{qty},
                   on_hand  = on_hand - #{qty},
                   updated_at = now()
             WHERE sku_id = #{sku} AND warehouse_id = #{wh} AND reserved >= #{qty} AND on_hand >= #{qty}
            """
                    + RETURNING)
    Optional<Stock> ship(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId, @Param("qty") int quantity);

    /**
     * 退货入库：实物加、可售加。
     *
     * <p><b>可售同时加</b>，因为回来的货重新可卖；只加实物会被 {@code ck_stock_balance} 当场拒——
     * 那道护栏正是在提示这一点。安全库存不动：商家没有重新配置它。
     */
    @Select(
            """
            UPDATE inventory.stock
               SET on_hand  = on_hand + #{qty},
                   available_to_promise = available_to_promise + #{qty},
                   updated_at = now()
             WHERE sku_id = #{sku} AND warehouse_id = #{wh}
            """
                    + RETURNING)
    Optional<Stock> restock(@Param("sku") UUID skuId, @Param("wh") UUID warehouseId, @Param("qty") int quantity);

    /**
     * 删掉一个 SKU 的全部库存行。<b>只给「从未上架过的草稿」删除用。</b>
     *
     * <p>有订单历史的 SKU 不能删 SKU 行，自然也不会走到这里；草稿的库存行留着只会变成
     * 永远没人再读的孤儿。流水 {@code stock_ledger} 不删——它是只追加的历史。
     */
    @Delete("DELETE FROM inventory.stock WHERE sku_id = #{sku}")
    int deleteBySku(@Param("sku") UUID skuId);
}
