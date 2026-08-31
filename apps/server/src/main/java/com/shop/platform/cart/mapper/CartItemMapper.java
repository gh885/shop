package com.shop.platform.cart.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
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
     * {@link CartItem#MAX_QUANTITY_PER_ITEM}（DB CHECK 同值兜底），返回落库后的整行。
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
            + " SET quantity = LEAST(c.quantity + EXCLUDED.quantity, " + CartItem.MAX_QUANTITY_PER_ITEM + "),"
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
     * 按本人归属批量删：结算清理、移除失效、删除选中共用；userId 圈定防误删他人条目。
     *
     * @return 实际删除行数
     */
    default int deleteByUserAndIds(UUID userId, Collection<UUID> ids) {
        return delete(new LambdaQueryWrapper<CartItem>()
                .eq(CartItem::getUserId, userId)
                .in(CartItem::getId, ids));
    }
}
