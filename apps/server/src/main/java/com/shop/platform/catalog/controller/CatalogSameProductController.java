package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.SameProductView;
import com.shop.platform.catalog.service.StandardProductService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.RateLimiter;
import java.time.Duration;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧同款比价：{@code standard_spu_id} 的第一个真实消费者。
 *
 * <p><b>为什么是独立端点，不塞进商品详情。</b> 商品详情是公开可缓存的
 * （{@code Cache-Control: max-age=30}，见 {@link CatalogQueryController}），
 * 而比价的结果随「哪些商家在卖、卖多少」变化——塞进去会让详情从「一个商品一份」
 * 变成「一个商品 × 全部同款一份」，缓存命中率直接掉到底。收藏的 {@code /exists}
 * 用的是同一条理由。
 *
 * <p>限流比详情更松：买家看一个商品时只会请求一次比价，而详情页会被反复刷新。
 * 但必须有——比价查询是 JOIN 三张表 + 递归 CTE，比详情贵得多。
 */
@RestController
@RequestMapping("/api/buyer/catalog")
public class CatalogSameProductController {

    /** 每操作者每分钟最多查多少次比价。正常浏览远低于它，脚本式爬取会被掐住。 */
    private static final int RATE_LIMIT = 300;

    private static final Duration RATE_WINDOW = Duration.ofMinutes(1);

    private final StandardProductService standards;
    private final Authorizer authorizer;
    private final RateLimiter rateLimiter;

    public CatalogSameProductController(
            StandardProductService standards, Authorizer authorizer, RateLimiter rateLimiter) {
        this.standards = standards;
        this.authorizer = authorizer;
        this.rateLimiter = rateLimiter;
    }

    /**
     * 同款聚合与按规格比价。
     *
     * <p>入参可以是任何标准品 id，包括已被合并的——内部顺着 {@code merged_into} 找到终点。
     * 所以卖家把商品挂到一个已合并的标准品上、或前端缓存了旧的 id，都不会 404。
     *
     * <p>返回空列表是正常的（标准品建出来了，但挂在它上面的商品现在都不在卖），
     * 不是错误。
     */
    @GetMapping("/standard-products/{standardSpuId}/offers")
    public SameProductView offers(@PathVariable UUID standardSpuId) {
        UUID buyerId = authorizer.current().operatorId();
        if (rateLimiter.exceeded("rl:catalog-offers:" + buyerId, RATE_LIMIT, RATE_WINDOW)) {
            throw BusinessException.rateLimited("请求太频繁，请稍后再试");
        }
        return standards.sameProduct(standardSpuId);
    }
}
