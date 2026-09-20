package com.shop.platform.favorite.service;

import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.favorite.mapper.FavoriteItemMapper;
import com.shop.platform.product.api.ProductReadQuery;
import com.shop.platform.product.api.ProductView;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteItemMapper favoriteItemMapper;

    private final ProductReadQuery productReadQuery;

    /**
     * 收藏：幂等开关。商品不存在或未上架拒绝；重复收藏由 upsert 原样返回既有行，不产生第二行。
     * 返回当前条目（已存在时为原行），前端据此渲染已收藏态。
     */
    @Transactional
    public FavoriteItem add(UUID userId, UUID productId) {
        // 1. 校验商品存在且已上架（product :: api 按 ID 只读查，禁止 JOIN）：查到且已上架才放行
        boolean published = productReadQuery
                .productById(productId)
                .filter(ProductView::published)
                .isPresent();
        Validate.isTrue(published, "商品不存在或已下架");

        // 2. 一条 upsert 落库（见 FavoriteItemMapper#upsertIdempotent）：未收藏则插入，已收藏原样返回既有行。
        //    不能靠 catch DuplicateKeyException 回读：PG 撞唯一索引即中止整个事务，catch 后发不出任何语句
        FavoriteItem item = favoriteItemMapper.upsertIdempotent(userId, productId);
        log.info("[FAVORITE] 收藏, userId={}, productId={}", userId, productId);
        return item;
    }

    /** 取消收藏：按商品 ID 删（收藏是开关不是行管理），幂等——不存在也返回成功 */
    @Transactional
    public void remove(UUID userId, UUID productId) {
        favoriteItemMapper.deleteByUserAndProduct(userId, productId);
    }

    /** 我的收藏分页：新收藏在前，商品卡片数据读取时拼装，下架商品 available=false 置灰保留 */
    @Transactional(readOnly = true)
    public PageResult<FavoriteItemView> list(UUID userId, long page, long size) {
        // 1. 分页拉收藏行（覆盖索引左前缀 user_id，按收藏时间倒序）
        var pageResult = favoriteItemMapper.selectPageByUser(userId, page, size);
        List<FavoriteItem> rows = pageResult.getRecords();
        if (rows.isEmpty()) {
            return new PageResult<>(List.of(), pageResult.getTotal());
        }

        // 2. 跨模块只读批查商品卡片数据（product :: api）
        List<UUID> productIds =
                rows.stream().map(FavoriteItem::getProductId).distinct().toList();
        Map<UUID, ProductView> products = productReadQuery.productsByIds(productIds);

        // 2.1 批查各商品收藏人数（本模块自有指标，不跨模块）
        Map<UUID, Long> collectCounts = favoriteItemMapper.collectCountByProductIds(productIds);

        // 3. 拼装视图：商品被删/下架 → available=false 原样保留置灰
        List<FavoriteItemView> views = rows.stream()
                .map(item -> assemble(item, products, collectCounts))
                .toList();
        return new PageResult<>(views, pageResult.getTotal());
    }

    /**
     * 批量判断哪些商品已被收藏：详情页「是否已收藏」用。
     *
     * <p>跨模块状态查询独立成接口而非塞进商品详情——product 模块不得反向依赖 favorite（边界），
     * 详情页并行发两个请求即可。返回入参的已收藏子集，顺序/缺省语义交给前端。
     */
    public List<UUID> favoritedProductIds(UUID userId, List<UUID> productIds) {
        if (productIds.isEmpty()) {
            return List.of();
        }
        return favoriteItemMapper.selectByUserAndProducts(userId, productIds).stream()
                .map(FavoriteItem::getProductId)
                .toList();
    }

    // ========== 内部 ==========

    /** 拼装单条视图：商品缺失 → 全空视图置灰 */
    private FavoriteItemView assemble(
            FavoriteItem item, Map<UUID, ProductView> products, Map<UUID, Long> collectCounts) {
        long collectCount = collectCounts.getOrDefault(item.getProductId(), 0L);
        ProductView p = products.get(item.getProductId());
        if (p == null) {
            return new FavoriteItemView(item.getId(), item.getProductId(), item.getCreatedAt(), null, false);
        }
        boolean available = p.published();
        FavoriteItemView.ProductInfo info = new FavoriteItemView.ProductInfo(
                p.id(), p.name(), p.mainImage(), p.minPrice(), p.maxPrice(), collectCount);
        return new FavoriteItemView(item.getId(), item.getProductId(), item.getCreatedAt(), info, available);
    }
}
