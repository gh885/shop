package com.shop.platform.account.model;

import java.time.Duration;

/**
 * 账号注销的时间窗口唯一出处。与 {@code OrderTimeouts} / {@code AfterSaleTimeouts} 同一理由：
 * 天数散写在扫描器、文档与前端提示里必然漂移，集中一处。
 */
public final class AccountDeletionTimeouts {

    /**
     * 注销冷静期（ACC-75）：提交申请后账号照常可用这么久，期内可随时撤销，期满由 {@code AccountDeletionJob}
     * 执行匿名化。
     *
     * <p>取 15 天而不是「点一下就删」：注销是不可逆的毁灭性动作，而本平台唯一的强凭证是手机号 + 短信码——
     * 手机在他人手上（盗号、旧 SIM 回收）即可远程注销他人账号。冷静期把「误操作与被盗用」的救济窗口
     * 留在用户自己手里，同时让删除在法律上仍然是「及时」的（申请即受理，只是不立即销毁）。
     *
     * <p>它<b>不是</b>审核期：期满不看平台脸色，只看闸门（期内是否被禁用）。窗口也不暂停——
     * 期间下的新单不会延长它，注销后在途单如何收尾见 ACC-76 的「不打断在途」口径。
     */
    public static final Duration COOLING_OFF = Duration.ofDays(15);

    private AccountDeletionTimeouts() {}
}
