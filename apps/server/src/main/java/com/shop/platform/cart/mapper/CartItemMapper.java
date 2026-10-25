package com.shop.platform.cart.mapper;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 购物车条目的读写。
 *
 * <p>归属形态与 account.addresses 同一条规矩：所有 SQL 绑 {@code buyer_id}，不写「先查后比对」。
 * 条目按 (buyer_id, sku_id) 唯一，skuId 就是这个资源的自然键——mapper 里没有行 id 的查询。
 */
@Mapper
public interface CartItemMapper {

    /** 整车，新加的在前 */
    @Select(
            """
            SELECT id, buyer_id, sku_id, quantity, selected, created_at, updated_at
              FROM cart.items
             WHERE buyer_id = #{buyerId}
             ORDER BY created_at DESC
            """)
    List<CartItemRow> findByBuyer(@Param("buyerId") UUID buyerId);

    @Select(
            """
            SELECT id, buyer_id, sku_id, quantity, selected, created_at, updated_at
              FROM cart.items
             WHERE buyer_id = #{buyerId} AND sku_id = #{skuId}
            """)
    Optional<CartItemRow> findByBuyerAndSku(@Param("buyerId") UUID buyerId, @Param("skuId") UUID skuId);

    @Select("SELECT count(*) FROM cart.items WHERE buyer_id = #{buyerId}")
    long countByBuyer(@Param("buyerId") UUID buyerId);

    @Select("SELECT count(*) FROM cart.items WHERE buyer_id = #{buyerId} AND selected")
    long countSelected(@Param("buyerId") UUID buyerId);

    /** 车内已有种类的全集：merge 的种类闸门用它做增量判断，不用逐条点查 */
    @Select("SELECT sku_id FROM cart.items WHERE buyer_id = #{buyerId}")
    List<UUID> skuIdsByBuyer(@Param("buyerId") UUID buyerId);

    /**
     * 加购：新条目插入，同 SKU 在行锁下数量累加封顶——不靠 catch 唯一键冲突回退，
     * PG 撞索引即中止整个事务，catch 后发不出任何语句。
     *
     * <p>合并后的真值不在这里取：MyBatis 的 insert 走 executeUpdate，RETURNING 的结果集
     * 到不了返回值里——调用方在同一个事务里 {@link #findByBuyerAndSku} 回读。
     *
     * <p>回写永不带 quantity 列的整行形状：累加列只在这一条 SQL 里动，
     * 改数量走 {@link #updateQuantity} 的条件更新，两条路不会互相抹值。
     */
    @Insert(
            """
            INSERT INTO cart.items (id, buyer_id, sku_id, quantity, selected)
            VALUES (#{id}, #{buyerId}, #{skuId}, #{quantity}, TRUE)
            ON CONFLICT (buyer_id, sku_id)
            DO UPDATE SET quantity = LEAST(cart.items.quantity + EXCLUDED.quantity, #{cap}),
                          updated_at = now()
            """)
    void upsertMerge(
            @Param("id") UUID id,
            @Param("buyerId") UUID buyerId,
            @Param("skuId") UUID skuId,
            @Param("quantity") int quantity,
            @Param("cap") int cap);

    /**
     * 改数量：只写给定列的条件更新。0 行（条目刚被删）是判决不是异常——下一次拉整车自然看不见它。
     */
    @Update(
            """
            UPDATE cart.items
               SET quantity = #{quantity}, updated_at = now()
             WHERE buyer_id = #{buyerId} AND sku_id = #{skuId}
            """)
    int updateQuantity(@Param("buyerId") UUID buyerId, @Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /**
     * 勾选集合重设的两步之一：整车先清。第二步把传入的 skuIds 置真。
     * 合起来是一个声明式 PUT——「当前勾选集合就是这批 skuId」，天然幂等。
     */
    @Update(
            """
            UPDATE cart.items
               SET selected = FALSE, updated_at = now()
             WHERE buyer_id = #{buyerId} AND selected
            """)
    int clearSelection(@Param("buyerId") UUID buyerId);

    @Update(
            """
            <script>
            UPDATE cart.items
               SET selected = TRUE, updated_at = now()
             WHERE buyer_id = #{buyerId} AND selected = FALSE
               AND sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    int markSelected(@Param("buyerId") UUID buyerId, @Param("skuIds") Collection<UUID> skuIds);

    @Delete("DELETE FROM cart.items WHERE buyer_id = #{buyerId} AND sku_id = #{skuId}")
    int deleteForBuyer(@Param("buyerId") UUID buyerId, @Param("skuId") UUID skuId);

    /** 批量删（下单后清勾选、清置灰）。带 buyer 条件是纵深防御——service 已按整车归属查过 */
    @Delete(
            """
            <script>
            DELETE FROM cart.items
             WHERE buyer_id = #{buyerId}
               AND sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    int deleteForBuyerIn(@Param("buyerId") UUID buyerId, @Param("skuIds") Collection<UUID> skuIds);

    /** 注销时的整车清理：没有任何行引用条目，留着只会白养数据 */
    @Delete("DELETE FROM cart.items WHERE buyer_id = #{buyerId}")
    int deleteByBuyer(@Param("buyerId") UUID buyerId);

    /** 下单清车：删掉本人车里被买下的条目（事件处理器调，归属由事件的 buyerId 圈定） */
    @Delete(
            """
            <script>
            DELETE FROM cart.items
             WHERE buyer_id = #{buyerId}
               AND sku_id IN
               <foreach collection="skuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
            </script>
            """)
    int deleteByBuyerAndSkuIds(@Param("buyerId") UUID buyerId, @Param("skuIds") Collection<UUID> skuIds);
}
