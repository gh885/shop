package com.shop.platform.audit.api;

import com.shop.platform.audit.mapper.AuditRecord;
import com.shop.platform.audit.mapper.AuditRecordMapper;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 审计写入命令（跨模块消费）：治理动作与审计行同事务原子生效。
 *
 * <p>同步调用而非事件：审计的语义是「动作确实发生了」，走事件就变成 at-least-once 的异步投递，
 * 出现「动作回滚了但账本里有行」与「动作成功了但监听没跑账本没行」两种偏差。宁可让写审计的失败
 * 把动作一起回滚——治理动作被账本拒了，人再去查比事后追一条假账便宜。
 *
 * <p>因此这里 {@code Propagation.MANDATORY}：审计行永远不单独存在，调用方必须在事务里。
 */
@Component
@RequiredArgsConstructor
public class RecordAuditCommand {

    private final AuditRecordMapper auditRecordMapper;

    /**
     * 记一行审计。targetType 不由调用点给——它由 action 决定（{@link AuditAction#targetType()}），
     * 同一动作不可能既动买家又动店铺。detail 是自由文本，调用点负责把敏感值先掩成
     * {@code PhoneNumber.mask()} 那样的形状再传进来。
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(AuditAction action, UUID targetId, UUID operatorId, String operatorName, String detail) {
        auditRecordMapper.insert(AuditRecord.builder()
                .action(action.code())
                .targetType(action.targetType().name())
                .targetId(targetId.toString())
                .operatorId(operatorId)
                .operatorName(operatorName)
                .detail(detail)
                .build());
    }
}
