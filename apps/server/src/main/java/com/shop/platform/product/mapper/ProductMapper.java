package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.Validate;
import com.shop.platform.product.dto.ProductAdminSort;
import com.shop.platform.product.dto.ProductSort;
import com.shop.platform.product.model.ProductStatus;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
import org.springframework.util.StringUtils;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    /**
     * 归属校验：商品存在且属于店铺上下文（X-Shop-Id 对应的 shopId）。卖家侧一切按 ID 操作商品的入口统一走这里，
     * 防止跨店读写——「越权说什么」只该定义一处。
     *
     * <p>非本店商品按<b>不存在</b>回答（404「商品不存在」，PRD-25）：这里曾是 403「商品不属于当前店铺」，
     * 等于替调用方确认「这个 productId 存在、只是别家的」，商品 ID 因此可被枚举。
     */
    default Product requireShopOwned(UUID shopId, UUID productId) {
        return Validate.requireOwned(selectById(productId), Product::getShopId, shopId, "商品不存在");
    }

    /**
     * 买家侧公开列表分页：只认 {@code PUBLISHED}（草稿/下架对买家不存在，状态写死而不作参数），可按可见类目集、
     * 店铺、名称/副标题关键字收窄，排序键由 {@link ProductSort} 定。
     *
     * <p>{@code visibleCategoryIds} 传 null = 不按类目收窄；<b>空集不走这里</b>——调用方在发查询前就短路成空页
     * （脏类目链接不该把列表页打成错误页），所以「没有」与「不限」是两个答案，不可以在这里合并成一句 SQL。
     *
     * <p>关键字与排序都由 service 归一后传入（trim 完的关键字、{@code fromWire} 出来的枚举），非法筛选值的 400
     * 闸门不在取数这半边。
     */
    default Page<Product> selectPublicPage(
            PageParams pageParams, List<UUID> visibleCategoryIds, UUID shopId, String keyword, ProductSort sort) {
        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<Product>()
                // 列表页只要卡片字段：不点名列就把 detail_images / images / specs / params 四个 JSONB 一起捞出来
                // （TOAST 外部存储读 + Jackson 反序列化），而 PublicProductView 一个都不用。列名与
                // PublicProductView.from 的取值一一对死——那个 record 加字段时这里必须同步加，
                // 否则新字段静默为 null（currency 也在内：min/maxPriceAsMoney 要在这一行闭合币种）。
                .select(
                        Product::getId,
                        Product::getShopId,
                        Product::getCategoryId,
                        Product::getName,
                        Product::getSubtitle,
                        Product::getMainImage,
                        Product::getMinPrice,
                        Product::getMaxPrice,
                        Product::getCurrency,
                        Product::getSoldCount,
                        Product::isSevenDayReturn)
                .eq(Product::getStatus, ProductStatus.PUBLISHED)
                .in(visibleCategoryIds != null, Product::getCategoryId, visibleCategoryIds)
                .eq(shopId != null, Product::getShopId, shopId);
        addKeywordFilter(wrapper, keyword);
        // 每种排序都补 id 兜底，保证翻页时同值记录顺序稳定（否则第 2 页可能重复第 1 页的行）
        switch (sort) {
            case PRICE_ASC -> wrapper.orderByAsc(Product::getMinPrice).orderByDesc(Product::getId);
            case PRICE_DESC -> wrapper.orderByDesc(Product::getMaxPrice).orderByDesc(Product::getId);
            case NEWEST -> wrapper.orderByDesc(Product::getCreatedAt).orderByDesc(Product::getId);
        }
        return selectPage(new Page<>(pageParams.page(), pageParams.size()), wrapper);
    }

    /**
     * 卖家工作台商品分页：本店 + 可选状态/关键字，排序键由 {@link ProductAdminSort} 定，同值行按 id 倒序兜底。
     *
     * <p>库存两档（{@code STOCK_ASC} / {@code STOCK_DESC}）在这里抛 {@link IllegalStateException} 而不是退化成
     * 默认排序：库存是 inventory 的跨模块聚合量、不在 products 的列上，DB 层排不出来，只能走
     * {@link #selectListByShop} 那一次全量取数后内存定序。让它静默变成「按创建时间排」会给出一个没人要的页。
     */
    default Page<Product> selectPageByShop(
            PageParams pageParams, UUID shopId, ProductStatus status, String keyword, ProductAdminSort sort) {
        LambdaQueryWrapper<Product> wrapper = filter(shopId, status, keyword);
        // 六个取值全列出、不写 default：switch 语句不做穷尽检查，漏一支会静默退化成「只剩 id 兜底序」
        switch (sort) {
            case CREATED_AT_ASC -> wrapper.orderByAsc(Product::getCreatedAt);
            case CREATED_AT_DESC -> wrapper.orderByDesc(Product::getCreatedAt);
            case SOLD_COUNT_ASC -> wrapper.orderByAsc(Product::getSoldCount);
            case SOLD_COUNT_DESC -> wrapper.orderByDesc(Product::getSoldCount);
            case STOCK_ASC, STOCK_DESC -> throw new IllegalStateException("库存排序走全量聚合分支，不进 DB 分页");
        }
        wrapper.orderByDesc(Product::getId);
        return selectPage(new Page<>(pageParams.page(), pageParams.size()), wrapper);
    }

    /**
     * 卖家「按库存排序」那一档的全量取数：本店 + 可选状态/关键字，一次捞回整店商品、<b>不带分页也不排序</b>。
     *
     * <p>排序键是跨模块聚合出来的库存量，不在本表列上（本项目不许跨 schema JOIN）→ SQL 层排不出来，
     * 只能由 service 内存聚合排序后再手动分页。这里不加 orderBy，是为了不让一个进不了 SQL 的排序键
     * 伪装成 DB 给的答案。
     */
    default List<Product> selectListByShop(UUID shopId, ProductStatus status, String keyword) {
        return selectList(filter(shopId, status, keyword));
    }

    /**
     * 这几个类目名下挂着多少商品（禁用闸门那个数）。
     *
     * <p>空集合短路回 0：MyBatis-Plus 会把空 {@code in} 拼成 {@code IN ()}，那是 PG 的语法错误而不是
     * 「一个商品都没有」，而子树为空时调用方要的答案正是 0（放行禁用）。
     */
    default long countByCategoryIds(Collection<UUID> categoryIds) {
        if (categoryIds.isEmpty()) {
            return 0L;
        }
        return selectCount(new LambdaQueryWrapper<Product>().in(Product::getCategoryId, categoryIds));
    }

    /** 销量投影累加（订单完成时经 product.api :: ProductCommand 调用）：单语句自增，并发完成不丢加 */
    @Update("UPDATE product.products SET sold_count = sold_count + #{quantity} WHERE id = #{productId}")
    int addSoldCount(@Param("productId") UUID productId, @Param("quantity") int quantity);

    /**
     * 级联下架（店铺停止营业时由 shop :: events 的监听器调用）：把该店全部「上架」商品置「仓库中」，返回下架行数。
     *
     * <p>单语句条件更新，读-改-写窗口内新上架的商品要么被这条 UPDATE 扫到、要么根本不在 PUBLISHED 集合里，
     * 不会漏也无需乐观锁；草稿/已在仓库的商品原样不动（下架只对在售的商品有意义）。
     * 与卖家手动 {@code ProductService.off} 同一目标态、同一条链路：下架不通知任何别的模块（product 无 events 包）。
     */
    @Update(
            """
            UPDATE product.products
            SET status = 'WAREHOUSE', updated_at = #{now}
            WHERE shop_id = #{shopId} AND status = 'PUBLISHED'
            """)
    int takedownPublished(@Param("shopId") UUID shopId, @Param("now") OffsetDateTime now);

    /**
     * 清空卖点：{@code subtitle} 是唯一「传空串就是要删」的标量列，而 {@code updateById} 默认忽略 null 字段，
     * 于是这一句必须单独走条件更新才写得出 NULL（其余字段仍走实体那条路径，理由见
     * {@code ProductService.updateBasic} 头注释：JSONB 列的 typeHandler 只在实体那条路径上生效）。
     */
    default int clearSubtitle(UUID productId) {
        return update(
                null,
                new LambdaUpdateWrapper<Product>().eq(Product::getId, productId).set(Product::getSubtitle, null));
    }

    /**
     * 状态转移的并发闸门：{@code WHERE id = ? AND status = from SET status = to}，回影响行数。
     *
     * <p>from / to 作参数而不是写死成守卫：哪条边合法由调用方按实体状态机（{@code Product.publishTo} /
     * {@code off} / {@code relist}）推导——同一条「发布」的目标态就有 PUBLISHED 与 WAREHOUSE 两个，把边写死
     * 在这里就得为每种目标复制一条语句，规则随之散成两份。本方法只保证「不在 from 那一态就不改」，
     * affected=0 之后是 409 还是让位由 service 判。与 {@code TicketMapper.transitionStatus} 同一形状。
     */
    default int transitionStatus(UUID productId, ProductStatus from, ProductStatus to) {
        return update(
                null,
                new LambdaUpdateWrapper<Product>()
                        .eq(Product::getId, productId)
                        .eq(Product::getStatus, from)
                        .set(Product::getStatus, to)
                        .set(Product::getUpdatedAt, OffsetDateTime.now()));
    }

    /** 店铺商品筛选条件：状态/名称，分页列表与「按库存排序」取全量集共用 */
    private static LambdaQueryWrapper<Product> filter(UUID shopId, ProductStatus status, String keyword) {
        // MP 的条件 boolean 参数不短路右侧表达式：keyword.trim() 必须先判空提取，否则无 keyword 请求 NPE
        String trimmedKeyword = keyword == null ? null : keyword.trim();
        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<Product>()
                .eq(Product::getShopId, shopId)
                .eq(status != null, Product::getStatus, status);
        addKeywordFilter(wrapper, trimmedKeyword);
        return wrapper;
    }

    /** 商品名称/副标题包含搜索；ILIKE + pg_trgm 保留大小写不敏感的包含匹配语义。
     *  用户输入里的 % / _ 是普通字符，必须转义后再拼 `%keyword%`，否则搜索词会变成通配表达式。 */
    private static void addKeywordFilter(LambdaQueryWrapper<Product> wrapper, String keyword) {
        if (!StringUtils.hasText(keyword)) return;
        String pattern = "%" + escapeLike(keyword.trim()) + "%";
        wrapper.and(q ->
                q.apply("name ILIKE {0} ESCAPE '\\'", pattern).or().apply("subtitle ILIKE {0} ESCAPE '\\'", pattern));
    }

    /** LIKE 通配符转义：先转义转义符本身，再转义 % 和 _。 */
    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
