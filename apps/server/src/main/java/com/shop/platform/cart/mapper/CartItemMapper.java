package com.shop.platform.cart.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.common.Quantities;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CartItemMapper extends BaseMapper<CartItem> {

    /**
     * 加购落库的唯一语句：新条目插入，同 SKU 已在车里则数量累加、封顶
     * {@link com.shop.platform.common.Quantities#LINE_QUANTITY_MAX}（DB CHECK 同值兜底），返回落库后的整行。
     *
     * <p>做成 upsert 而不是「先查再插、撞唯一索引后 catch 回退合并」：PG 一旦因唯一索引报错就把整个
     * 事务标记为 aborted，catch 之后的任何语句都会 25P02 失败（pgjdbc 默认 autosave=never，不打 savepoint），
     * 回退路径根本执行不到。顺带消掉了读-改-写在并发加购下的丢失更新——累加在行锁下由 DB 完成。
     *
     * <p>声明为 {@code @Select} 是消费 RETURNING 结果集的既定姿势（走 executeQuery 而非 executeUpdate）；
     * id / created_at / updated_at 全部由列默认值生成，不经 MyBatis-Plus 自动填充。
     */
    @Select("INSERT INTO cart.items AS c (user_id, sku_id, quantity, selected)"
            + " VALUES (#{userId}, #{skuId}, #{quantity}, TRUE)"
            + " ON CONFLICT (user_id, sku_id) DO UPDATE"
            + " SET quantity = LEAST(c.quantity + EXCLUDED.quantity, " + Quantities.LINE_QUANTITY_MAX + "),"
            + "     updated_at = NOW()"
            + " RETURNING *")
    CartItem upsertMerging(@Param("userId") UUID userId, @Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /** 本人某 SKU 条目：加购前判定「是否新占一个条目坑」用 */
    default CartItem selectByUserAndSku(UUID userId, UUID skuId) {
        return selectOne(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSkuId, skuId));
    }

    /** 整车条目，新加的在前 */
    default List<CartItem> selectWholeCart(UUID userId) {
        return selectList(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .orderByDesc(CartItem::getCreatedAt));
    }

    /** 整车条目数（角标） */
    default long countByUser(UUID userId) {
        return selectCount(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, userId));
    }

    /** 勾选条目数（角标） */
    default long countSelectedByUser(UUID userId) {
        return selectCount(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSelected, true));
    }

    /**
     * 批量勾选：一条语句把勾选位刷到整车或刷到点名的那几条，回影响行数。
     *
     * <p>归属靠 {@code WHERE user_id}：别人条目的 id 递进来落不进这一句——既改不动数据，也不因为
     * 「改了 0 行」与「改了 N 行」的差别把别人的条目存在性说出来（CART-05 同一口径）。
     *
     * <p>{@code itemIds} 传 null <b>与传空集都是「作用于整车」</b>：全选/取消全选那一发请求本来就不带 id 列表，
     * 两种缺席同义；空集合不退化成「一条都不改」，也不拼成 {@code IN ()}（那是 PG 的语法错误）。
     */
    default int updateSelected(UUID userId, Boolean selected, Collection<UUID> itemIds) {
        LambdaUpdateWrapper<CartItem> update = new LambdaUpdateWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .set(CartItem::getSelected, selected)
                .set(CartItem::getUpdatedAt, OffsetDateTime.now());
        if (itemIds != null && !itemIds.isEmpty()) {
            update.in(CartItem::getId, itemIds);
        }
        return update(null, update);
    }

    /**
     * 改一条的数量 / 勾选位（PATCH 语义：传 null 即保持原值），回影响行数。
     *
     * <p>不走 {@code updateById}：数量列是 {@link #upsertMerging} 在行锁下累加的列，整行回写会把打开页面时读到的
     * 数量写回、抹掉并发加购累上去的那几件（{@code CartItem.quantity} 标了 NEVER，实体路径写不进这一列）。
     * 归属靠 {@code WHERE user_id}，与 {@link #updateSelected} 同一口径；0 行 = 条目已被删，调用方不报错。
     */
    default int updateOne(UUID userId, UUID id, Integer quantity, Boolean selected, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<CartItem>()
                        .eq(CartItem::getId, id)
                        .eq(CartItem::getUserId, userId)
                        .set(quantity != null, CartItem::getQuantity, quantity)
                        .set(selected != null, CartItem::getSelected, selected)
                        .set(CartItem::getUpdatedAt, now));
    }

    /**
     * 按本人归属批量删：结算清理、移除失效、删除选中共用；userId 圈定防误删他人条目。
     *
     * @return 实际删除行数
     */
    default int deleteByUserAndIds(UUID userId, Collection<UUID> ids) {
        return delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .in(CartItem::getId, ids));
    }

    /** 下单清理（OrderPlacedEvent 监听）：按本人归属 + SKU 集合删，不依赖条目 id；userId 圈定防误删他人条目 */
    default int deleteByUserAndSkuIds(UUID userId, Collection<UUID> skuIds) {
        return delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .in(CartItem::getSkuId, skuIds));
    }

    /**
     * 账号注销清理（UserDeletedEvent 监听）：车里是「想买什么」的意愿数据，人走了不留（ACC-76）。
     * 与下单清理同为硬删——购物车本来就没有回收站语义。
     */
    default int deleteByUser(UUID userId) {
        return delete(new LambdaQueryWrapper<CartItem>().eq(CartItem::getUserId, userId));
    }
}
