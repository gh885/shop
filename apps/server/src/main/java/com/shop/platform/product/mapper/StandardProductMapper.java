package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.product.model.StandardProductStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface StandardProductMapper extends BaseMapper<StandardProduct> {

    /** 按 ID 点查可用的标准品（挂靠校验用）：不存在与已合并同为「不可挂靠」，由调用方决定话术 */
    default StandardProduct selectActiveById(UUID id) {
        return selectOne(new LambdaQueryWrapper<StandardProduct>()
                .eq(StandardProduct::getId, id)
                .eq(StandardProduct::getStatus, StandardProductStatus.ACTIVE));
    }

    /**
     * 卖家挂靠时的候选：只出可用的标准品，可按类目与关键词收窄。
     *
     * <p>关键词打在 name / brand / barcode 三列上：卖家手上有货号就直接搜条码，只记得名字就搜名字，
     * 三条路都通才叫「找得到」。不分页（候选上限由调用方封顶）——挂靠是「从一屏里挑一个」的动作，
     * 翻页对它没有意义。
     */
    default List<StandardProduct> selectCandidates(UUID categoryId, String keyword, int limit) {
        LambdaQueryWrapper<StandardProduct> query =
                new LambdaQueryWrapper<StandardProduct>().eq(StandardProduct::getStatus, StandardProductStatus.ACTIVE);
        if (categoryId != null) {
            query.eq(StandardProduct::getCategoryId, categoryId);
        }
        if (keyword != null && !keyword.isBlank()) {
            query.and(w -> w.like(StandardProduct::getName, keyword)
                    .or()
                    .like(StandardProduct::getBrand, keyword)
                    .or()
                    .eq(StandardProduct::getBarcode, keyword));
        }
        return selectList(query.orderByDesc(StandardProduct::getCreatedAt).last("LIMIT " + limit));
    }

    /** 同条码是否已被别的可用标准品占用（条码唯一索引兜底并发，这里给友好 400） */
    default boolean barcodeTaken(String barcode, UUID excludeId) {
        return selectCount(new LambdaQueryWrapper<StandardProduct>()
                        .eq(StandardProduct::getBarcode, barcode)
                        .eq(StandardProduct::getStatus, StandardProductStatus.ACTIVE)
                        .ne(excludeId != null, StandardProduct::getId, excludeId))
                > 0;
    }

    /**
     * 合并落库：来源置 MERGED、记去向、释放条码，一条语句做完。
     *
     * <p>不能走 {@code updateById}：它忽略 null 字段，「清空条码」写不进去（与 {@code ProductMapper.clearSubtitle}
     * 同一个坑）。也不拼 wrapper：{@code status} 既在守卫里又在 set 里，会被 {@code SecondWriterColumnGateTest}
     * 认成转移列——而这里没有并发窗口（合并是平台手点的低频动作，来源此刻已被本语句置 MERGED）。
     */
    @Update(
            """
            UPDATE product.standard_products
            SET status = 'MERGED', merged_into = #{targetId}, barcode = NULL, updated_at = #{now}
            WHERE id = #{sourceId} AND status = 'ACTIVE'
            """)
    int markMerged(
            @Param("sourceId") UUID sourceId, @Param("targetId") UUID targetId, @Param("now") OffsetDateTime now);
}
