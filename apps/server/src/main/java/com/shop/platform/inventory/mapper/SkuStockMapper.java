package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 库存主体 Mapper：跨模块不暴露，仅本模块 service/api 包内使用。
 *
 * <p>存量增减是「WHERE 闸门 + RETURNING OLD/NEW 前后两帧」的单语句（PG18 方言，依赖
 * <a href="https://www.postgresql.org/docs/18/dml-returning.html">RETURNING OLD/NEW</a>）：
 * 闸门在行锁下原子求值，无行返回 = 条件未过；前后帧同语句可见，流水记账免二次查询、天然连续。
 * 声明为 {@code @Select} 是消费 RETURNING 结果集的既定姿势（走 executeQuery 而非 executeUpdate）。
 */
@Mapper
public interface SkuStockMapper extends BaseMapper<SkuStock> {

    /** 幂等建行一条语句：并发撞 uk_sku_stock 时 ON CONFLICT 让位，无异常分支、免预查 */
    @Insert("INSERT INTO inventory.sku_stock (sku_id) VALUES (#{skuId}) ON CONFLICT (sku_id) DO NOTHING")
    int insertIgnoreConflict(@Param("skuId") UUID skuId);

    /** 冻结一行：可用量足够才 frozen += n，返回前后两帧 */
    @Select(
            """
            UPDATE inventory.sku_stock SET frozen_stock = frozen_stock + #{quantity}
            WHERE sku_id = #{skuId} AND stock - frozen_stock >= #{quantity}
            RETURNING sku_id AS "skuId",
                      OLD.stock AS "beforeStock", OLD.frozen_stock AS "beforeFrozenStock",
                      stock AS "afterStock", frozen_stock AS "afterFrozenStock"
            """)
    StockFrames freezeOne(@Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /** 扣实一行：冻结充分才 stock -= n 且 frozen -= n，返回前后两帧 */
    @Select(
            """
            UPDATE inventory.sku_stock
            SET stock = stock - #{quantity}, frozen_stock = frozen_stock - #{quantity}
            WHERE sku_id = #{skuId} AND frozen_stock >= #{quantity}
            RETURNING sku_id AS "skuId",
                      OLD.stock AS "beforeStock", OLD.frozen_stock AS "beforeFrozenStock",
                      stock AS "afterStock", frozen_stock AS "afterFrozenStock"
            """)
    StockFrames captureOne(@Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /** 释放一行：冻结充分才 frozen -= n（货还回可卖池），返回前后两帧 */
    @Select(
            """
            UPDATE inventory.sku_stock SET frozen_stock = frozen_stock - #{quantity}
            WHERE sku_id = #{skuId} AND frozen_stock >= #{quantity}
            RETURNING sku_id AS "skuId",
                      OLD.stock AS "beforeStock", OLD.frozen_stock AS "beforeFrozenStock",
                      stock AS "afterStock", frozen_stock AS "afterFrozenStock"
            """)
    StockFrames releaseOne(@Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /** 补货一行：stock += n（不设闸门，行不存在即无返回），返回前后两帧 */
    @Select(
            """
            UPDATE inventory.sku_stock SET stock = stock + #{quantity}
            WHERE sku_id = #{skuId}
            RETURNING sku_id AS "skuId",
                      OLD.stock AS "beforeStock", OLD.frozen_stock AS "beforeFrozenStock",
                      stock AS "afterStock", frozen_stock AS "afterFrozenStock"
            """)
    StockFrames restockOne(@Param("skuId") UUID skuId, @Param("quantity") int quantity);

    /** 按 skuId 查库存主体行（无行返回 null；存量增减都以行存在为前提） */
    default SkuStock selectBySkuId(UUID skuId) {
        return selectOne(new LambdaQueryWrapper<SkuStock>().eq(SkuStock::getSkuId, skuId));
    }

    /** 删库存主体行（SKU 移除时；调用侧保证冻结已为零） */
    default int deleteBySkuId(UUID skuId) {
        return delete(new LambdaQueryWrapper<SkuStock>().eq(SkuStock::getSkuId, skuId));
    }
}
