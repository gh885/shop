package com.shop.platform.infra.db;

import com.shop.platform.common.BusinessException;
import org.springframework.dao.DuplicateKeyException;

/**
 * 唯一索引冲突 → 409 的统一出口。
 *
 * <p>「先查后插」挡不住并发，唯一索引才是真相：撞键即该业务键已被占用，调用方给出人话 detail 即可。
 * 只适用于「撞键后不需要继续使用同一事务」的场景——PG 一旦报唯一冲突即中止当前事务，
 * 需要在冲突后回读（幂等重放、ON CONFLICT 替代）的路径必须用 {@code ON CONFLICT} 而非 catch。
 */
public final class DuplicateKeys {

    private DuplicateKeys() {}

    /**
     * 执行写入，撞唯一索引时抛 409（detail 为给前端的信息）。
     *
     * @param action 单条 insert/update（撞键后无需继续用本事务）
     * @param detail 409 的对外说明，如「该运单号已录入，请核对后重试」
     */
    public static void conflictOnDuplicate(Runnable action, String detail) {
        try {
            action.run();
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict(null, detail);
        }
    }
}
