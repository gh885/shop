package com.shop.platform.notification.service;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.notification.dto.NotificationDtos.NotificationPage;
import com.shop.platform.notification.dto.NotificationDtos.NotificationView;
import com.shop.platform.notification.mapper.NotificationMapper;
import com.shop.platform.notification.mapper.NotificationRow;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * 站内信的读路径：买家与商家各自的列表和未读计数。
 *
 * <p>分页统一是 {@code (created_at, id)} 复合游标，多取一条判下一页——与评价同一套。
 * params 以 JSON 原文落库，出口解成 Map：形状随 type 变化，后端不做模板校验。
 */
@Service
public class NotificationQueryService {

    private static final TypeReference<Map<String, Object>> PARAMS = new TypeReference<>() {};

    private final NotificationMapper messages;

    public NotificationQueryService(NotificationMapper messages) {
        this.messages = Objects.requireNonNull(messages, "messages");
    }

    /** 买家通知列表。 */
    @Transactional(readOnly = true)
    public NotificationPage forBuyer(UUID buyerId, String cursor, int limit) {
        return page(
                cursor,
                limit,
                fetch -> messages.pageForBuyer(buyerId, fetch.cursorAt(), fetch.cursorId(), fetch.limit()));
    }

    /** 商家通知列表。 */
    @Transactional(readOnly = true)
    public NotificationPage forMerchant(UUID merchantId, String cursor, int limit) {
        return page(
                cursor,
                limit,
                fetch -> messages.pageForMerchant(merchantId, fetch.cursorAt(), fetch.cursorId(), fetch.limit()));
    }

    /** 买家未读计数：铃铛徽标。 */
    public long unreadCountForBuyer(UUID buyerId) {
        return messages.countUnreadForBuyer(buyerId);
    }

    /** 商家未读计数。 */
    public long unreadCountForMerchant(UUID merchantId) {
        return messages.countUnreadForMerchant(merchantId);
    }

    private record Fetch(Instant cursorAt, UUID cursorId, int limit) {}

    /** 多取一条判下一页；游标取最后一行的 created_at。 */
    private static NotificationPage page(String cursor, int limit, Function<Fetch, List<NotificationRow>> fetcher) {
        CursorCodec.Point point = cursor == null ? null : CursorCodec.decode(cursor);
        Fetch fetch = new Fetch(point == null ? null : point.createdAt(), point == null ? null : point.id(), limit + 1);
        List<NotificationRow> rows = fetcher.apply(fetch);
        String nextCursor = null;
        if (rows.size() > limit) {
            rows = rows.subList(0, limit);
            NotificationRow last = rows.getLast();
            nextCursor = CursorCodec.encode(last.createdAt(), last.id());
        }
        return new NotificationPage(
                rows.stream().map(NotificationQueryService::toView).toList(), nextCursor);
    }

    private static NotificationView toView(NotificationRow row) {
        Map<String, Object> params = row.paramsJson() == null ? Map.of() : JsonColumns.read(row.paramsJson(), PARAMS);
        return new NotificationView(row.id(), row.type(), params, row.link(), row.readAt(), row.createdAt());
    }
}
