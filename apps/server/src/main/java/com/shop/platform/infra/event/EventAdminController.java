package com.shop.platform.infra.event;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Permission;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理端事件入口：看未完成的登记、放行重投超限的事件。
 *
 * <p>背景：{@link EventRetryJob} 对超过 {@code maxAttempts} 的事件不再自动重试——没有上限，
 * 一个永远失败的监听器会被打成风扇。代价是超限事件从此卡住，唯一出口曾经是手工 SQL 清计数。
 * 这个 controller 把「查清根因 → 放行」做成正规操作。
 *
 * <p>重放为什么是安全的：同一条事件再投一遍，消费端 {@link EventInbox} 按 eventId 去重挡住重复，
 * 业务侧的状态前置条件（CAS）挡住重复推进——重放多少遍都只生效一次。前提依然是先修根因：
 * 不修的话放行只会再失败一轮，回到超限。
 */
@RestController
@RequestMapping("/api/admin/events")
public class EventAdminController {

    /** 清单上限。未完成事件积压到几百条时系统已经在报警了，清单不是用来翻历史的。 */
    private static final int LIST_LIMIT = 100;

    private final EventPublicationStore store;
    private final Authorizer authorizer;

    public EventAdminController(EventPublicationStore store, Authorizer authorizer) {
        this.store = store;
        this.authorizer = authorizer;
    }

    /** 未完成事件，重投次数多的排前面。完整报文超出的部分进不了清单，按 id 排查时再看库。 */
    @GetMapping("/incomplete")
    public List<EventPublicationStore.IncompleteEvent> incomplete() {
        staffWith(Permission.EVENT_REPLAY);
        return store.findIncomplete(LIST_LIMIT);
    }

    /**
     * 放行一条超限事件：清零重投计数，下一轮补发任务（≤30 秒）自动捡起。
     *
     * <p>0 行 = 已完成或不存在，两种都拒——已完成的事件没有可重放的东西，
     * 静默 200 会让人误以为"已重新排队"。
     */
    @PostMapping("/{id}/requeue")
    public Requeued requeue(@PathVariable UUID id) {
        staffWith(Permission.EVENT_REPLAY);
        if (!store.resetAttempts(id)) {
            throw BusinessException.conflict("事件不存在或已完成，无需重放: " + id);
        }
        return new Requeued(id);
    }

    public record Requeued(UUID id) {}

    private void staffWith(Permission permission) {
        authorizer.check(permission);
        CurrentOperator operator = authorizer.current();
        if (!CurrentOperator.TYPE_STAFF.equals(operator.operatorType())) {
            throw BusinessException.forbidden("STAFF_ONLY", "只有平台员工可以操作事件登记");
        }
    }
}
