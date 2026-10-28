package com.shop.platform.account.service;

import com.shop.platform.account.dto.UpdateLocaleRequest;
import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.web.SupportedLocales;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 买家的语言偏好。写入路径的唯一出口。
 *
 * <p>三套身份域各有自己的一份（买家 / 卖家 / 员工），不共用表也不共用 service——
 * 它们改的是同一个概念，但操作的主体不同，合并只会让"改谁的"变成分支。
 *
 * <p>归一与白名单都在 {@link SupportedLocales}：客户端可能送 {@code zh-CN}，落库前先归到
 * {@code zh-Hans-CN}；送一个不存在的语言直接 400，不静默落默认——静默会让"我选了日语"和
 * "我选了中文"在库里长得一样，用户回来发现语言没变却没有任何提示。
 */
@Service
public class BuyerLocaleService {

    private final BuyerMapper buyers;

    public BuyerLocaleService(BuyerMapper buyers) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
    }

    /**
     * 改语言偏好。
     *
     * @param expectedAccountId 客户端以为自己在改谁；与令牌不一致回 409。这是防「切换账号后误写」，
     *     不是越权检查——令牌已经保证了"只能改自己的"，这里防的是时序
     */
    public String update(UUID buyerId, UpdateLocaleRequest request) {
        if (!buyerId.toString().equals(request.expectedAccountId())) {
            throw BusinessException.conflict("账号已切换，请重新操作");
        }
        Locale matched = SupportedLocales.normalize(request.preferredLocale());
        if (matched == null) {
            throw BusinessException.badRequest("不支持的语言: " + request.preferredLocale());
        }
        String normalized = matched.toLanguageTag();
        if (!buyers.updatePreferredLocale(buyerId, normalized)) {
            throw BusinessException.unauthorized("账号不存在或已停用");
        }
        return normalized;
    }

    /** 读当前偏好。没设过返回 null（不是默认语言——两者在展示时都落默认，但语义不同）。 */
    public String find(UUID buyerId) {
        return buyers.findPreferredLocale(buyerId).orElse(null);
    }
}
