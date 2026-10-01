package com.shop.platform.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.audit.api.AuditTargetType;
import com.shop.platform.audit.dto.AdminAuditQuery;
import com.shop.platform.audit.mapper.AuditRecord;
import com.shop.platform.audit.mapper.AuditRecordMapper;
import com.shop.platform.audit.service.AuditQueryService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 审计查询（service 层，mock mapper）：筛选值的枚举解析、时间窗方向、出参映射。
 *
 * <p>查询条件的组装住在 mapper（不在这里测），本测试钉的是 service 的两件独有职责：
 * 「非法枚举筛选值给 400，不给查不到就当没有的静默放行」与「出参把 code 原样交出、不回查各模块表」。
 */
@ExtendWith(MockitoExtension.class)
class AuditQueryServiceTest {

    @Mock
    AuditRecordMapper auditRecordMapper;

    @InjectMocks
    AuditQueryService auditQueryService;

    private final PageParams page = new PageParams(1, 10);

    private AuditRecord record(UUID id, UUID operatorId) {
        return AuditRecord.builder()
                .id(id)
                .action("account.user.status_changed")
                .targetType("USER")
                .targetId("target-1")
                .operatorId(operatorId)
                .operatorName("张三")
                .detail("已禁用")
                .createdAt(OffsetDateTime.parse("2026-01-05T00:00:00Z"))
                .build();
    }

    private Page<AuditRecord> pageOf(AuditRecord... rows) {
        Page<AuditRecord> p = new Page<>(1, 10);
        p.setRecords(List.of(rows));
        p.setTotal(rows.length);
        return p;
    }

    @Nested
    class 筛选与出参 {
        @Test
        void 操作人对象动作与时间窗_解析成枚举后取数并原样映射出参() {
            UUID operatorId = UUID.randomUUID();
            UUID recordId = UUID.randomUUID();
            OffsetDateTime from = OffsetDateTime.parse("2026-01-01T00:00:00Z");
            OffsetDateTime to = OffsetDateTime.parse("2026-01-31T00:00:00Z");
            when(auditRecordMapper.selectPageAdmin(
                            page,
                            operatorId,
                            AuditTargetType.USER,
                            "target-1",
                            "account.user.status_changed",
                            from,
                            to))
                    .thenReturn(pageOf(record(recordId, operatorId)));

            var result = auditQueryService.pageAudits(
                    page, new AdminAuditQuery(operatorId, "USER", "target-1", "account.user.status_changed", from, to));

            assertEquals(1, result.total());
            var item = result.records().getFirst();
            // action/targetType 给 code 原样（前端按词表映射中文），不回查各模块表
            assertEquals(recordId, item.id());
            assertEquals("account.user.status_changed", item.action());
            assertEquals("USER", item.targetType());
            assertEquals("target-1", item.targetId());
            assertEquals(operatorId, item.operatorId());
            assertEquals("张三", item.operatorName());
            assertEquals("已禁用", item.detail());
        }

        @Test
        void 目标ID全空白_视同不筛_传null给mapper() {
            when(auditRecordMapper.selectPageAdmin(any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(pageOf());

            auditQueryService.pageAudits(page, new AdminAuditQuery(null, null, "   ", null, null, null));

            // 输入框里留一个空格不该变成「查不到任何行」的筛选条件
            var targetIdCap = ArgumentCaptor.forClass(String.class);
            verify(auditRecordMapper).selectPageAdmin(any(), any(), any(), targetIdCap.capture(), any(), any(), any());
            assertNull(targetIdCap.getValue());
        }

        @Test
        void 条件全空_照常取数_枚举解析为null() {
            when(auditRecordMapper.selectPageAdmin(any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(pageOf());

            var result = auditQueryService.pageAudits(page, new AdminAuditQuery(null, null, null, null, null, null));

            assertEquals(0, result.total());
        }
    }

    @Nested
    class 非法筛选值_400 {
        @Test
        void 时间窗方向写反_400且不给空页误导() {
            var ex = assertThrows(
                    BusinessException.class,
                    () -> auditQueryService.pageAudits(
                            page,
                            new AdminAuditQuery(
                                    null,
                                    null,
                                    null,
                                    null,
                                    OffsetDateTime.parse("2026-02-01T00:00:00Z"),
                                    OffsetDateTime.parse("2026-01-01T00:00:00Z"))));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("开始时间不能晚于"));
            verifyNoInteractions(auditRecordMapper);
        }

        @Test
        void 未知目标类型_400不静默放行() {
            var ex = assertThrows(
                    BusinessException.class,
                    () -> auditQueryService.pageAudits(
                            page, new AdminAuditQuery(null, "BOGUS", null, null, null, null)));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("非法的审计目标类型"));
            verifyNoInteractions(auditRecordMapper);
        }

        @Test
        void 未知动作_400不静默放行() {
            var ex = assertThrows(
                    BusinessException.class,
                    () -> auditQueryService.pageAudits(
                            page, new AdminAuditQuery(null, "USER", null, "no.such.code", null, null)));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("非法的审计动作"));
            verifyNoInteractions(auditRecordMapper);
        }

        @Test
        void 单端时间窗_方向校验不触发() {
            // 只给 from 不给 to：无从比较方向，不该拦在校验里，正常落到取数
            when(auditRecordMapper.selectPageAdmin(any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(pageOf());

            var result = auditQueryService.pageAudits(
                    page,
                    new AdminAuditQuery(null, null, null, null, OffsetDateTime.parse("2026-01-01T00:00:00Z"), null));

            assertEquals(0, result.total());
        }
    }
}
