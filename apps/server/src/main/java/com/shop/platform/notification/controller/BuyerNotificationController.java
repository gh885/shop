package com.shop.platform.notification.controller;

import com.shop.platform.common.PagingRules;
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
 * 买家侧站内信：列表、未读数、标已读、全部已读。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这条通知是不是发给我的」——id 一律配 buyer_id
 * 在 SQL 里核，别人的通知查出空折 404。
 */
@RestController
@RequestMapping("/api/buyer/notifications")
public class BuyerNotificationController {

    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationService service;
    private final NotificationQueryService queries;
    private final Authorizer authorizer;

    public BuyerNotificationController(
            NotificationService service, NotificationQueryService queries, Authorizer authorizer) {
        this.service = service;
        this.queries = queries;
        this.authorizer = authorizer;
    }

    /** 通知列表：新到旧，游标翻页。 */
    @GetMapping
    public NotificationPage page(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        UUID buyerId = authorizer.current().operatorId();
        return queries.forBuyer(buyerId, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 未读计数：铃铛徽标。 */
    @GetMapping("/unread/count")
    public long unreadCount() {
        UUID buyerId = authorizer.current().operatorId();
        return queries.unreadCountForBuyer(buyerId);
    }

    /** 标一条已读。幂等：已读过不报错。 */
    @PostMapping("/{id}/read")
    public void markRead(@PathVariable UUID id) {
        UUID buyerId = authorizer.current().operatorId();
        service.markReadForBuyer(id, buyerId);
    }

    /** 全部已读。 */
    @PostMapping("/read-all")
    public void markAllRead() {
        UUID buyerId = authorizer.current().operatorId();
        service.markAllReadForBuyer(buyerId);
    }
}
