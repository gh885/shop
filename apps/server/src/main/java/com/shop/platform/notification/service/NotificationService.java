package com.shop.platform.notification.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.notification.mapper.NotificationMapper;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 站内信的写路径：标已读（单条 CAS、全部已读）。
 *
 * <p>标已读幂等：CAS 带 {@code read_at IS NULL}，0 行重读——还在就是已读过（成功不报错），
 * 不在（不存在或别人的）折 404，不暴露行是否存在。
 */
@Service
public class NotificationService {

    private final NotificationMapper messages;

    public NotificationService(NotificationMapper messages) {
        this.messages = Objects.requireNonNull(messages, "messages");
    }

    /** 买家标一条已读。 */
    @Transactional
    public void markReadForBuyer(UUID id, UUID buyerId) {
        if (messages.markReadForBuyer(id, buyerId) == 0
                && messages.findForBuyer(id, buyerId).isEmpty()) {
            throw BusinessException.notFound("通知不存在: " + id);
        }
    }

    /** 商家标一条已读。 */
    @Transactional
    public void markReadForMerchant(UUID id, UUID merchantId) {
        if (messages.markReadForMerchant(id, merchantId) == 0
                && messages.findForMerchant(id, merchantId).isEmpty()) {
            throw BusinessException.notFound("通知不存在: " + id);
        }
    }

    /** 买家全部已读。 */
    @Transactional
    public void markAllReadForBuyer(UUID buyerId) {
        messages.markAllReadForBuyer(buyerId);
    }

    /** 商家全部已读。 */
    @Transactional
    public void markAllReadForMerchant(UUID merchantId) {
        messages.markAllReadForMerchant(merchantId);
    }
}
