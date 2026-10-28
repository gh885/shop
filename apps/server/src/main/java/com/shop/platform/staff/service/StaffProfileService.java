package com.shop.platform.staff.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.infra.web.SupportedLocales;
import com.shop.platform.staff.dto.UpdateStaffLocaleRequest;
import com.shop.platform.staff.mapper.StaffMapper;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 员工自服务与员工列表。
 *
 * <p>写动作（建、调岗、禁用）在 {@link StaffManagementService}——那里有末位超管保护这类治理闸门。
 * 这里只有「我是谁」「我改自己的语言」「管理员看列表」三件事，都不改变治理状态。
 */
@Service
public class StaffProfileService {

    private static final Set<String> STATUSES = Set.of("active", "disabled");

    /** 列表一次最多拉多少条。后台列表靠人翻，拉一万条没有意义。 */
    private static final int MAX_PAGE_SIZE = 100;

    private final StaffMapper store;

    public StaffProfileService(StaffMapper store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    /**
     * 我是谁。
     *
     * <p>权限清单从 {@code CurrentOperator} 取，不再查一次库——那是认证时刚算好的同一份数据，
     * 重查只会在两次查询之间制造一个不一致窗口。
     */
    public StaffProfile me(CurrentOperator operator) {
        StaffMapper.ProfileRow row =
                store.findProfile(operator.operatorId()).orElseThrow(() -> BusinessException.unauthorized("账号不存在或已停用"));
        return new StaffProfile(
                row.id(),
                row.loginName(),
                row.displayName(),
                row.role(),
                row.status(),
                List.copyOf(operator.permissions()),
                row.preferredLocale());
    }

    /** 改语言偏好。归一 + 白名单在 {@link SupportedLocales}，返回落库的那个串。 */
    public String updateLocale(CurrentOperator operator, UpdateStaffLocaleRequest request) {
        if (!operator.operatorId().toString().equals(request.expectedAccountId())) {
            throw BusinessException.conflict("账号已切换，请重新操作");
        }
        Locale matched = SupportedLocales.normalize(request.preferredLocale());
        if (matched == null) {
            throw BusinessException.badRequest("不支持的语言: " + request.preferredLocale());
        }
        String normalized = matched.toLanguageTag();
        if (!store.updatePreferredLocale(operator.operatorId(), normalized)) {
            throw BusinessException.unauthorized("账号不存在或已停用");
        }
        return normalized;
    }

    /**
     * 员工列表。游标是 {@code (created_at, id)}。
     *
     * <p>筛错状态词回 400，不放进去变成永远空页——与买家列表同口径。
     */
    @Transactional(readOnly = true)
    public StaffPage adminPage(String status, String keyword, String cursor, int limit) {
        if (status != null && !status.isBlank() && !STATUSES.contains(status)) {
            throw BusinessException.badRequest("未知的员工状态: " + status);
        }
        int pageSize = Math.clamp(limit, 1, MAX_PAGE_SIZE);
        CursorCodec.Point point = cursor == null || cursor.isBlank() ? null : CursorCodec.decode(cursor);
        List<StaffMapper.StaffListRow> rows = store.listForAdmin(
                status == null || status.isBlank() ? null : status,
                keyword == null || keyword.isBlank() ? null : keyword.trim(),
                point == null ? null : OffsetDateTime.ofInstant(point.createdAt(), ZoneOffset.UTC),
                point == null ? null : point.id(),
                pageSize + 1);

        boolean hasMore = rows.size() > pageSize;
        List<StaffMapper.StaffListRow> page = hasMore ? rows.subList(0, pageSize) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode(
                        page.getLast().createdAt().toInstant(), page.getLast().id())
                : null;

        return new StaffPage(
                page.stream()
                        .map(row -> new StaffItem(
                                row.id(),
                                row.loginName(),
                                row.displayName(),
                                row.role(),
                                row.status(),
                                row.createdAt()))
                        .toList(),
                nextCursor);
    }

    /**
     * me 出参。
     *
     * @param permissions 展开后的具体权限码。前端画菜单用，真正的闸门在每个接口上
     * @param preferredLocale 没表过态时为 null
     */
    public record StaffProfile(
            UUID id,
            String loginName,
            String displayName,
            String role,
            String status,
            List<String> permissions,
            @Schema(nullable = true) String preferredLocale) {}

    /** 列表的一行。不含密码哈希。 */
    public record StaffItem(
            UUID id, String loginName, String displayName, String role, String status, OffsetDateTime createdAt) {}

    /** 一页。{@code nextCursor} 为 null 就是最后一页。 */
    public record StaffPage(List<StaffItem> items, String nextCursor) {}
}
