package com.shop.platform.rum.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.rum.RumVocabulary;
import com.shop.platform.rum.dto.AdminRumEventQuery;
import com.shop.platform.rum.dto.AdminRumIssueQuery;
import com.shop.platform.rum.mapper.RumEvent;
import com.shop.platform.rum.mapper.RumEventMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 遥测排查的读侧：把 {@code rum.rum_events} 里的明细变成「有哪些问题 → 这一个问题都发生了什么 →
 * 具体那一次长什么样」三级。
 *
 * <p>只读本模块的 schema、不 JOIN 任何别的表：事件行里的 {@code userId} / {@code sessionId} 是
 * 不带语义的文本标识，不为了「让表格好看」去 account 模块回查人名——那会让遥测入口欠 account
 * 一份依赖，而排查要的是「有多少人受影响」，不是「他们叫什么」。
 *
 * <p>三条口径：
 *
 * <ol>
 *   <li><b>时间窗默认最近 24 小时，且<b>只给下界</b>。</b>见 {@link #DEFAULT_WINDOW} 与 {@link #window}。
 *       按全部聚合等于每次翻页全表扫，而排查的第一个问题永远是「刚才怎么了」；上界为什么不给，
 *       那条注释里是这期唯一一处反直觉的决定。
 *   <li><b>{@code app} / {@code kind} 的非法值给 400，不是静默返回空页。</b>筛错了和真的没有是两件事，
 *       而空页把前者伪装成后者——手册里写着 web，手打成 wev，看到「最近没问题」就下班了。
 *   <li><b>窗口按 {@code created_at}。</b>与聚合、与保留清理同一把尺子（理由见 {@code RumEventMapper}）。
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class RumQueryService {

    /** 不给时间窗时看多久。24 小时是「上一次发布到现在」的量级，也是排查默认要回答的那一段 */
    private static final Duration DEFAULT_WINDOW = Duration.ofHours(24);

    private final RumEventMapper rumEventMapper;

    /** 问题列表：按指纹聚合，按影响会话数降序 */
    @Transactional(readOnly = true)
    public PageResult<AdminRumIssueItem> pageIssues(PageParams pageParams, AdminRumIssueQuery query) {
        // 1. 语义筛选值自判（400）：@Size 只挡长度，值合不合法收在这里，与全库其他列表同一口径
        String app = appFilter(query.app());
        String kind = kindFilter(query.kind());

        // 2. 时间窗（含默认值与方向自判）
        TimeWindow window = window(query.from(), query.to());

        // 3. 取数。聚合在 SQL 里闭合，这里只把行摊成出参形状
        Page<Map<String, Object>> rows =
                rumEventMapper.selectIssuePage(pageParams, app, kind, window.from(), window.to());
        return new PageResult<>(
                rows.getRecords().stream().map(RumQueryService::toIssueItem).toList(), rows.getTotal());
    }

    /** 明细列表：点进一个问题之后看到的就是它 */
    @Transactional(readOnly = true)
    public PageResult<AdminRumEventItem> pageEvents(PageParams pageParams, AdminRumEventQuery query) {
        String app = appFilter(query.app());
        String kind = kindFilter(query.kind());
        String route = Text.blankToNull(query.route());
        String fingerprint = Text.blankToNull(query.fingerprint());
        TimeWindow window = window(query.from(), query.to());

        Page<RumEvent> rows =
                rumEventMapper.selectEventPage(pageParams, fingerprint, app, kind, route, window.from(), window.to());
        return new PageResult<>(
                rows.getRecords().stream().map(RumQueryService::toEventItem).toList(), rows.getTotal());
    }

    /**
     * 单条原件。缺了给 404——「这条不存在」和「这条不归你」在这里没有区别可言（能进这个端点就已经
     * 过了 RUM_VIEW），所以不必套越权口径。
     */
    @Transactional(readOnly = true)
    public AdminRumEventDetail eventDetail(UUID id) {
        RumEvent row = Validate.notNull(rumEventMapper.selectById(id), "事件不存在");
        return new AdminRumEventDetail(
                row.getId(),
                row.getTs(),
                row.getCreatedAt(),
                row.getApp(),
                row.getKind(),
                row.getName(),
                row.getVersion(),
                row.getEnv(),
                row.getRoute(),
                row.getSessionId(),
                row.getUserId(),
                row.getFingerprint(),
                row.getMessage(),
                row.getPayload());
    }

    /**
     * 端筛选值：空白 = 不过滤，名单外 400。
     *
     * <p>走 {@link RumVocabulary#APPS} 而不是另抄一份名单——接收端就是按它把 app 折成 {@code other} 的，
     * 查询侧照它筛，两边对「有哪些端」始终是同一个答案。
     */
    private static String appFilter(String raw) {
        String value = Text.blankToNull(raw);
        Validate.isTrue(value == null || RumVocabulary.APPS.contains(value), "app 只能是 " + RumVocabulary.APPS);
        return value;
    }

    private static String kindFilter(String raw) {
        String value = Text.blankToNull(raw);
        Validate.isTrue(value == null || RumVocabulary.KINDS.contains(value), "kind 只能是 " + RumVocabulary.KINDS);
        return value;
    }

    private record TimeWindow(OffsetDateTime from, OffsetDateTime to) {}

    /**
     * 时间窗：只给下界，**默认不给上界**。
     *
     * <p>缺 {@code from} 就是「最近 24 小时」（以 {@code to} 为基准，没有 {@code to} 就以现在为基准）。
     * 缺 {@code to} 时上界是**空的**，不是「现在」——这条是本类唯一一处反直觉的设计，理由是：
     * 上界要跟 {@code created_at} 比，而 {@code created_at} 是**写侧**的时钟（应用实例自己的 now，
     * 见 {@code RumEventArchive}），下界之外的一切比较都只在两个时钟之间进行。多实例部署下实例间
     * 差几毫秒、本机 WSL 与宿主差几十毫秒，都会让**刚刚上报的错误落在上界之外**——而「刚发生的问题
     * 看不见」正是错误追踪最不能有的毛病，排查时表现为「明明报错了，列表里没有」。
     *
     * <p>代价只是一个理论上不可能出现的未来行会被算进来（created_at 永远是写侧的当下）。相较之下，
     * 调用方**显式**给 {@code to} 时那句仍照常生效——那是人明确要一个区间，语义优先于时钟。
     *
     * <p>方向写反（from 晚于 to）给 400 而不是空页：那是筛选条件写错了，空页会让人以为
     * 「这段时间什么都没发生」。
     */
    private static TimeWindow window(OffsetDateTime from, OffsetDateTime to) {
        Validate.isTrue(from == null || to == null || !from.isAfter(to), "开始时间不能晚于结束时间");
        OffsetDateTime start = from != null ? from : (to != null ? to : OffsetDateTime.now()).minus(DEFAULT_WINDOW);
        return new TimeWindow(start, to);
    }

    private static AdminRumIssueItem toIssueItem(Map<String, Object> row) {
        return new AdminRumIssueItem(
                (String) row.get("fingerprint"),
                (String) row.get("app"),
                (String) row.get("kind"),
                (String) row.get("message"),
                (String) row.get("route"),
                ((Number) row.get("sessions")).longValue(),
                ((Number) row.get("events")).longValue(),
                toOffsetDateTime(row.get("first_seen")),
                toOffsetDateTime(row.get("last_seen")));
    }

    private static AdminRumEventItem toEventItem(RumEvent row) {
        return new AdminRumEventItem(
                row.getId(),
                row.getTs(),
                row.getCreatedAt(),
                row.getApp(),
                row.getKind(),
                row.getName(),
                row.getVersion(),
                row.getEnv(),
                row.getRoute(),
                row.getSessionId(),
                row.getUserId(),
                row.getFingerprint(),
                row.getMessage());
    }

    /**
     * {@code selectMaps} 拿回来的时间列是 JDBC 原生类型，**不走 MyBatis 的 {@code OffsetDateTimeTypeHandler}**
     * ——那条路要有实体声明（属性类型）才生效，而 map 投影没有属性类型，落到 {@code ObjectTypeHandler}，
     * PG 的 timestamptz 到手就是 {@link Timestamp}。
     *
     * <p>两种都接住而不是只接 Timestamp：驱动/连接的时区设置变了的话，返回的就可能是
     * {@link OffsetDateTime}，那时抛 ClassCastException 会把一个纯粹的类型差异变成 500。
     */
    private static OffsetDateTime toOffsetDateTime(Object value) {
        if (value instanceof OffsetDateTime odt) {
            return odt;
        }
        if (value instanceof Timestamp ts) {
            return ts.toInstant().atOffset(ZoneOffset.UTC);
        }
        return null;
    }
}
