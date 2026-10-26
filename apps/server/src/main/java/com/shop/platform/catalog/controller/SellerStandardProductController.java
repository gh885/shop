package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.dto.StandardSpuView;
import com.shop.platform.catalog.service.StandardProductService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家侧标准品挂靠。
 *
 * <p>挂靠是卖家自己的聚合声明：平台提供标准品库，卖家说「我这个商品就是那个东西」。
 * 自动匹配只做精确匹配（型号 / 款号 / 参数哈希全等），而同一个东西的写法有很多种，
 * 精确匹配挂不上的，只能靠卖家自己认——所以人工挂靠不是「兜底」，是主路径之一。
 *
 * <p><b>用 {@code PRODUCT_WRITE} 而不是 {@code PRODUCT_READ}。</b> 挂靠改的是商品数据，
 * 会让自家商品出现在别人的比价列表里——这是写，不是读。
 */
@RestController
@RequestMapping("/api/seller/standard-products")
public class SellerStandardProductController {

    private final StandardProductService standards;
    private final Authorizer authorizer;

    public SellerStandardProductController(StandardProductService standards, Authorizer authorizer) {
        this.standards = standards;
        this.authorizer = authorizer;
    }

    /**
     * 挂靠候选。只出可用的（已合并的不出现）。
     *
     * <p>不按「这个商品能不能挂」过滤：标准品与商家商品的类目本来就可能不一致
     * （商家挂错类目是常事），用类目做硬闸会让正确的挂靠也挂不上。类目只作可选收窄。
     */
    @GetMapping
    public List<StandardSpuView.Candidate> candidates(
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) String keyword) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return standards.candidates(categoryId, keyword);
    }

    /**
     * 给自家商品挂靠 / 取消挂靠标准品。{@code standardSpuId} 传 null 即取消。
     *
     * <p>归属写进 SQL（{@code merchant_id = ?}），不是查出来再比对——查不到就是 404，
     * 不是 403：403 本身就是「这个 id 存在」的确认。
     */
    @PutMapping("/products/{spuId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bind(@PathVariable UUID spuId, @RequestBody BindRequest request) {
        authorizer.check(Permission.PRODUCT_WRITE);
        standards.bind(spuId, authorizer.current().merchantId(), request.standardSpuId());
    }

    /**
     * 本店有多少商品挂在这个标准品上。
     *
     * <p>挂靠前先看它——挂错了会让自家两个商品互相被当成同款，
     * 而比价里出现自己打自己是最容易发现也最尴尬的错配。
     */
    @GetMapping("/{standardSpuId}/bound-count")
    public BoundCount boundCount(@PathVariable UUID standardSpuId) {
        authorizer.check(Permission.PRODUCT_WRITE);
        return new BoundCount(standards.countBound(authorizer.current().merchantId(), standardSpuId));
    }

    /** {@code standardSpuId} 为 null = 取消挂靠。 */
    public record BindRequest(UUID standardSpuId) {}

    public record BoundCount(long count) {}
}
