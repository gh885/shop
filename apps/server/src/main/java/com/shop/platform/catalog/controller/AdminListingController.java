package com.shop.platform.catalog.controller;

import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.service.CatalogPublishService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧商品审核。只有 staff 身份能进，靠 {@code PRODUCT_REVIEW} 权限点判。
 *
 * <p>和 {@link AdminCategoryController} 分成两个 controller：那边管"这个格子要填什么"，
 * 这边管"这条商品合不合规"。权限点也分开（{@code CATEGORY_MANAGE} / {@code PRODUCT_REVIEW}）——
 * 合成一个，就等于让每个能改类目的人都能放行商品，而类目是发布闸门的输入。
 *
 * <p>路径前缀 {@code /api/admin}：三端各自独立入口是既定做法，不合成"看身份分流"的接口。
 */
@RestController
@RequestMapping("/api/admin/listings")
public class AdminListingController {

    /**
     * 队列一次最多拉多少条。审核靠人处理，拉一万条没有意义；
     * 而它会随大促涨到那个量级——所以上限写死在这里，不让调用方传 100000。
     */
    private static final int QUEUE_LIMIT = 100;

    private final CatalogPublishService catalog;
    private final Authorizer authorizer;

    public AdminListingController(CatalogPublishService catalog, Authorizer authorizer) {
        this.catalog = catalog;
        this.authorizer = authorizer;
    }

    /** 审核队列。FIFO，先提交的先审；{@code merchantId} 传了只看这家店的提交。 */
    @GetMapping
    public List<ListingMapper.PendingOffer> pending(@RequestParam(required = false) UUID merchantId) {
        authorizer.platform(Permission.PRODUCT_REVIEW);
        return catalog.pendingOffers(merchantId, QUEUE_LIMIT);
    }

    /**
     * 审核通过。<b>通过即上架</b>——不留在 approved 中间态，那个状态没人推进。
     *
     * <p>原来这里是 approve / publish 两个接口，中间的 APPROVED 状态没有任何代码推进：
     * 商家看到"审核通过"但商品搜不到，后台也没有"待上架"队列。
     * 一个没人负责推进的中间态等于把商品卡死在那里。
     */
    @PostMapping("/{listingId}/approve")
    public void approveListing(@PathVariable UUID listingId) {
        authorizer.platform(Permission.PRODUCT_REVIEW);
        catalog.approveOffer(listingId, authorizer.current().operatorId());
    }

    /**
     * 驳回。理由必填——空理由的驳回，商家只知道"没过"不知道该改什么，
     * 他会原样重提，然后你再驳回一次，round +1，两边都白费。
     */
    @PostMapping("/{listingId}/reject")
    public void rejectListing(@PathVariable UUID listingId, @Valid @RequestBody RejectRequest request) {
        authorizer.platform(Permission.PRODUCT_REVIEW);
        catalog.rejectListing(listingId, authorizer.current().operatorId(), request.reason());
    }

    /**
     * 下架。只有 online 能下——pending 的商品还没上过架，谈不上下架。
     *
     * <p>平台侧不提供"下架后让商家原样重提"：那要看为什么下架。
     * 违规下架不该让商家原样再提交一遍，那是治理决策，不是一个接口能替商家决定的。
     */
    @PostMapping("/{listingId}/offline")
    public void offlineListing(@PathVariable UUID listingId, @Valid @RequestBody OfflineRequest request) {
        authorizer.platform(Permission.PRODUCT_REVIEW);
        catalog.offlineOffer(listingId, authorizer.current().operatorId(), request.reason());
    }

    public record RejectRequest(@NotBlank @Size(max = 500) String reason) {}

    public record OfflineRequest(@NotBlank @Size(max = 500) String reason) {}
}
