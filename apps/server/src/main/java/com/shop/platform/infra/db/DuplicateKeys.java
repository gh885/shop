package com.shop.platform.infra.db;

import com.shop.platform.common.BusinessException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.dao.DuplicateKeyException;

/**
 * 唯一索引冲突 → 409 的统一出口。
 *
 * <p>「先查后插」挡不住并发，唯一索引才是真相：撞键即该业务键已被占用，调用方给出人话 detail 即可。
 * 只适用于「撞键后不需要继续使用同一事务」的场景——PG 一旦报唯一冲突即中止当前事务，
 * 需要在冲突后回读（幂等重放、ON CONFLICT 替代）的路径必须用 {@code ON CONFLICT} 而非 catch。
 *
 * <p><b>两个出口按「用户手里有没有可改的输入框」分</b>：撞的是一个用户填的字段、能标红输入的，
 * 走 {@link #fieldDuplicated}（附带 {@code errors[field]}，前端把这句话落到那个框上）；用户点了按钮 /
 * 拨了开关、没有框可标红的，走 {@link #conflictOnDuplicate}（只能弹一句 toast）。
 *
 * <p>两者的状态码都是 409——撞唯一索引是资源状态冲突（RFC 9110 对 409 的定义），而前端标不标红只看
 * {@code errors[]}、与状态码无关（{@code serverFieldErrors} 只读 errors）。所以分岔落在「带不带 errors」，
 * 不落在状态码上：400 不更适合这件事（它说的是「请求本身非法」，而这请求完全合法）。
 */
public final class DuplicateKeys {

    private DuplicateKeys() {}

    /**
     * 执行写入，撞唯一索引时抛 409（detail 为给前端的信息）。
     *
     * <p>用户没有对应输入框时用它（点了按钮、拨了开关）——只能弹一句 toast。有框可标红的走
     * {@link #fieldDuplicated}。
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

    /**
     * 执行写入，撞唯一索引时抛 409 + {@code errors[field]}：用户填的值已被占用，前端把这句话落到那个输入框上。
     *
     * <p>与 {@link #conflictOnDuplicate} 同一状态码，多的那一格 errors 才是指向输入框的部分。
     *
     * @param action 单条 insert/update（撞键后无需继续用本事务）
     * @param field 消费方表单/DTO 的机器字段名（如 {@code "name"}、{@code "value"}），非中文标签
     * @param detail 409 的对外说明，同时作为 {@code errors[field].message}
     */
    public static void fieldDuplicated(Runnable action, String field, String detail) {
        try {
            action.run();
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict(null, detail, List.of(Map.of("field", field, "message", detail)));
        }
    }

    /**
     * 执行写入，撞唯一索引时按异常分岔成不同的 409：同一张表有多个唯一索引、该说的话不同时用
     * （如 shipments 的「一单一张待发货」索引与「运单号全局唯一」索引，撞哪个说哪句）。
     *
     * <p>{@code resolve} 只许读异常自身——约束名在 {@code getMostSpecificCause().getMessage()} 里；
     * PG 冲突后事务已中止，冲突行的 id 之类的值在这里查不了。
     */
    public static void conflictOnDuplicate(
            Runnable action, Function<DuplicateKeyException, BusinessException> resolve) {
        try {
            action.run();
        } catch (DuplicateKeyException e) {
            throw resolve.apply(e);
        }
    }
}
