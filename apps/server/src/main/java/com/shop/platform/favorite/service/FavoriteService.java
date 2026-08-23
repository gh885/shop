package com.shop.platform.favorite.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Validate;
import com.shop.platform.favorite.mapper.FavoriteItem;
import com.shop.platform.favorite.mapper.FavoriteItemMapper;
import com.shop.platform.infra.db.CrossSchemaReader;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class FavoriteService {

    /** product.products 状态值约定（裸 SQL 只读访问，不 import 对方模块类） */
    private static final int PRODUCT_STATUS_PUBLISHED = 1;

    /** product.products 投影列（收藏卡片：标题/主图/现价区间） */
    private static final List<String> PRODUCT_COLUMNS =
            List.of("shop_id", "name", "main_image", "min_price", "max_price", "status");

    private final FavoriteItemMapper favoriteItemMapper;

    private final CrossSchemaReader reader;

    /**
     * 收藏：幂等开关。商品不存在或未上架拒绝；重复收藏撞唯一索引后静默回退为无操作。
     * 返回当前条目（已存在时为原行），前端据此渲染已收藏态。
     */
    @Transactional
    public FavoriteItem add(UUID userId, UUID productId) {
        // 1. 校验商品存在且已上架（跨 schema 只读按 ID 查，禁止 JOIN）
        Integer status = reader.byId(
                "product.products", List.of("status"), productId, rs -> rs.getObject("status", Integer.class));
        Validate.isTrue(status != null && status == PRODUCT_STATUS_PUBLISHED, "商品不存在或已下架");

        // 2. 幂等：已在收藏夹直接返回原行
        FavoriteItem existing = favoriteItemMapper.selectOne(new LambdaQueryWrapper<FavoriteItem>()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getProductId, productId));
        if (existing != null) {
            return existing;
        }

        // 3. 落行；并发重复收藏撞 uk_favorite_items_user_product 时回退查原行
        FavoriteItem item =
                FavoriteItem.builder().userId(userId).productId(productId).build();
        try {
            favoriteItemMapper.insert(item);
            log.info("[FAVORITE] 收藏, userId={}, productId={}", userId, productId);
            return item;
        } catch (DuplicateKeyException e) {
            return favoriteItemMapper.selectOne(new LambdaQueryWrapper<FavoriteItem>()
                    .eq(FavoriteItem::getUserId, userId)
                    .eq(FavoriteItem::getProductId, productId));
        }
    }

    /** 取消收藏：按商品 ID 删（收藏是开关不是行管理），幂等——不存在也返回成功 */
    @Transactional
    public void remove(UUID userId, UUID productId) {
        favoriteItemMapper.delete(new LambdaQueryWrapper<FavoriteItem>()
                .eq(FavoriteItem::getUserId, userId)
                .eq(FavoriteItem::getProductId, productId));
    }

    /** 我的收藏分页：新收藏在前，商品卡片数据读取时拼装，下架商品 available=false 置灰保留 */
    public PageResult<FavoriteItemView> list(UUID userId, long page, long size) {
        // 1. 分页拉收藏行（覆盖索引左前缀 user_id，按收藏时间倒序）
        var pageResult = favoriteItemMapper.selectPage(
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, size),
                new LambdaQueryWrapper<FavoriteItem>()
                        .eq(FavoriteItem::getUserId, userId)
                        .orderByDesc(FavoriteItem::getCreatedAt));
        List<FavoriteItem> rows = pageResult.getRecords();
        if (rows.isEmpty()) {
            return new PageResult<>(List.of(), pageResult.getTotal());
        }

        // 2. 跨 schema 只读批查商品卡片数据
        Map<UUID, ProductRow> products = loadProducts(
                rows.stream().map(FavoriteItem::getProductId).distinct().toList());

        // 3. 拼装视图：商品被删/下架 → available=false 原样保留置灰
        List<FavoriteItemView> views =
                rows.stream().map(item -> assemble(item, products)).toList();
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
        return favoriteItemMapper
                .selectList(new LambdaQueryWrapper<FavoriteItem>()
                        .eq(FavoriteItem::getUserId, userId)
                        .in(FavoriteItem::getProductId, productIds))
                .stream()
                .map(FavoriteItem::getProductId)
                .toList();
    }

    // ========== 内部 ==========

    /** 拼装单条视图：商品缺失 → 全空视图置灰 */
    private FavoriteItemView assemble(FavoriteItem item, Map<UUID, ProductRow> products) {
        ProductRow p = products.get(item.getProductId());
        if (p == null) {
            return new FavoriteItemView(item.getId(), item.getProductId(), item.getCreatedAt(), null, false);
        }
        boolean available = p.status() == PRODUCT_STATUS_PUBLISHED;
        FavoriteItemView.ProductInfo info = new FavoriteItemView.ProductInfo(
                p.id(),
                p.name(),
                p.mainImage(),
                p.minPrice() == null ? null : Money.cny(p.minPrice()),
                p.maxPrice() == null ? null : Money.cny(p.maxPrice()));
        return new FavoriteItemView(item.getId(), item.getProductId(), item.getCreatedAt(), info, available);
    }

    /** product.products 按 ID 批查卡片字段（经 infra CrossSchemaReader） */
    private Map<UUID, ProductRow> loadProducts(List<UUID> productIds) {
        return reader.byIds(
                "product.products",
                PRODUCT_COLUMNS,
                productIds,
                rs -> new ProductRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getString("main_image"),
                        rs.getObject("min_price", Long.class),
                        rs.getObject("max_price", Long.class),
                        rs.getObject("status", Integer.class)));
    }

    /** product.products 行投影（favorite 视角只需要卡片与可用性字段） */
    private record ProductRow(UUID id, String name, String mainImage, Long minPrice, Long maxPrice, Integer status) {}
}
