package com.shop.platform.notification.controller;

import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.notification.dto.NotificationDtos.NotificationPage;
import com.shop.platform.notification.service.NotificationQueryService;
import com.shop.platform.notification.service.NotificationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商家侧站内信：新订单、店铺处置结果的收件箱。
 *
 * <p>own-account 端点，不挂权限码：收件人是 merchant 本身，收窄靠 SQL 里的 merchant_id
 * 绑定（授权店铺范围的客服也看得见，与店铺列表同口径——通知是商家主体的，不是单店的）。
 */
@RestController
@RequestMapping("/api/seller/notifications")
public class SellerNotificationController {

    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationService service;
    private final NotificationQueryService queries;
    private final Authorizer authorizer;

    public SellerNotificationController(
            NotificationService service, NotificationQueryService queries, Authorizer authorizer) {
        this.service = service;
        this.queries = queries;
        this.authorizer = authorizer;
    }

    /** 通知列表：新到旧，游标翻页。 */
    @GetMapping
    public NotificationPage merchantPage(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        AccessScope.Seller scope = authorizer.seller();
        return queries.forMerchant(scope.merchantId(), cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 未读计数。 */
    @GetMapping("/unread/count")
    public long merchantUnreadCount() {
        AccessScope.Seller scope = authorizer.seller();
        return queries.unreadCountForMerchant(scope.merchantId());
    }

    /** 标一条已读。幂等：已读过不报错。 */
    @PostMapping("/{id}/read")
    public void merchantMarkRead(@PathVariable UUID id) {
        AccessScope.Seller scope = authorizer.seller();
        service.markReadForMerchant(id, scope.merchantId());
    }

    /** 全部已读。 */
    @PostMapping("/read-all")
    public void merchantMarkAllRead() {
        AccessScope.Seller scope = authorizer.seller();
        service.markAllReadForMerchant(scope.merchantId());
    }
}
