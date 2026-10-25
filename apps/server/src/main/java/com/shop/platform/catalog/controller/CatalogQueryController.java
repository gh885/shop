package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.service.CatalogPublishService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.RateLimiter;
import java.time.Duration;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧只读入口。商品详情只暴露 online listing 覆盖的 SKU。
 *
 * <p>两件不做就会变成敞口的事：
 *
 * <ul>
 *   <li><b>限流。</b> 商品详情是爬虫的第一目标——一秒拉几百个 spuId 的脚本和真实用户的
 *       请求形状没有区别，只能靠配额拦。按操作者限，超了回 429。
 *   <li><b>短缓存。</b> 详情是天然可缓存的读（30 秒内的价格/库存漂移可接受，
 *       真正的扣库存和算价都在下单链路上）。没有缓存头，每一屏商品页都是一次全量点查，
 *       大促的第一波流量直接打穿主库。
 * </ul>
 */
@RestController
@RequestMapping("/api/buyer/catalog")
public class CatalogQueryController {

    /** 每操作者每分钟最多看多少个商品详情。正常浏览远远够用，脚本式抓取会被掐住。 */
    private static final int DETAIL_RATE_LIMIT = 600;

    private static final Duration DETAIL_RATE_WINDOW = Duration.ofMinutes(1);

    private final CatalogPublishService catalog;
    private final Authorizer authorizer;
    private final StringRedisTemplate redis;

    public CatalogQueryController(CatalogPublishService catalog, Authorizer authorizer, StringRedisTemplate redis) {
        this.catalog = catalog;
        this.authorizer = authorizer;
        this.redis = redis;
    }

    @GetMapping("/products/{spuId}")
    public ResponseEntity<ProductDetail> product(@PathVariable UUID spuId) {
        UUID buyerId = authorizer.current().operatorId();
        if (RateLimiter.exceeded(redis, "rl:catalog-detail:" + buyerId, DETAIL_RATE_LIMIT, DETAIL_RATE_WINDOW)) {
            throw BusinessException.rateLimited("请求太频繁，请稍后再试");
        }
        ProductDetail detail = catalog.product(spuId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(30)))
                .body(detail);
    }
}
