package com.shop.telemetry.server.ingest.internal;

import com.shop.telemetry.server.grouping.Fingerprinter;
import com.shop.telemetry.server.ingest.NormalizedEvent;
import com.shop.telemetry.server.issues.IssueEvent;
import com.shop.telemetry.server.issues.IssueService;
import com.shop.telemetry.server.shared.Ids;
import com.shop.telemetry.server.store.DropCounter;
import com.shop.telemetry.server.store.EventRecord;
import com.shop.telemetry.server.store.EventStore;
import com.shop.telemetry.server.store.ReleaseStore;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 队列消费者。**唯一的写入者**：relay 只往 stream 里写，落库只发生在这里。
 *
 * <p>为什么值得单独一段代码：它的两个属性决定了整条链的正确性。
 *
 * <ol>
 *   <li>**at-least-once**。读（XREADGROUP）→ 处理 → ACK 不是原子的，崩溃/重投必然发生。
 *       所以"是否首次插入"必须由数据库唯一约束回答（{@code append} 返回 false = 重复），
 *       而 {@code event_count + 1} 只能挂在"首次插入成功"的分支上。
 *   <li>**一次 ingest 是一个事务**。event 插入、issue 聚合、回填关联三件事要么全成要么全回滚；
 *       半成品会让重投看到"事件在、issue 没链上"，然后永远修不回来。
 * </ol>
 *
 * <p>认识的 kind 各走各的归一化：{@code event}（分组进 issue）、{@code transaction}（进 trace）、
 * {@code release}（部署锚点）。其余先原样落库（用内容哈希做幂等键）——不认识的类型
 * **不能丢**，丢了就永远不知道为什么"数据看起来少了"。
 */
@Component
@Profile({"worker", "all"})
public class IngestWorker implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(IngestWorker.class);
    private static final String GROUP = "telemetry-worker";
    private static final String STREAM_PREFIX = "telemetry:ingest:";
    /**
     * kind 不写死：relay 按 item 类型分 stream，官方 SDK 还会发 {@code client_report}、
     * {@code attachment} 之类我们暂时不认识的类型。写死清单的后果是"没人消费的 stream 无限增长"——
     * 一种不报错、只在磁盘上体现的故障。所以定期扫一遍前缀，见到就消费（不认识的先原样落库）。
     */
    private static final Duration KINDS_REFRESH = Duration.ofSeconds(5);
    private static final int BATCH = 100;
    private static final Duration IDLE = Duration.ofMillis(250);
    /** 单轮 PEL 重投上限，防病态循环。 */
    private static final int MAX_DRAIN = 10_000;

    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    private final EventNormalizer normalizer;
    private final TransactionNormalizer transactions;
    private final Fingerprinter fingerprinter;
    private final EventStore events;
    private final IssueService issues;
    private final DropCounter drops;
    private final ReleaseStore releases;
    private final TransactionTemplate tx;
    private final String consumerName = "worker-" + ProcessHandle.current().pid();

    private final Set<String> groupsReady = ConcurrentHashMap.newKeySet();
    private volatile Set<String> kinds = Set.of();
    private volatile long kindsRefreshedAt;
    private final Set<String> pendingDrained = ConcurrentHashMap.newKeySet();

    private volatile boolean running;
    private Thread thread;

    IngestWorker(
            StringRedisTemplate redis,
            ObjectMapper json,
            EventNormalizer normalizer,
            TransactionNormalizer transactions,
            Fingerprinter fingerprinter,
            EventStore events,
            IssueService issues,
            DropCounter drops,
            ReleaseStore releases,
            TransactionTemplate tx) {
        this.redis = redis;
        this.json = json;
        this.normalizer = normalizer;
        this.transactions = transactions;
        this.fingerprinter = fingerprinter;
        this.events = events;
        this.issues = issues;
        this.drops = drops;
        this.releases = releases;
        this.tx = tx;
    }

    @Override
    public void start() {
        if (running) {
            return;
        }
        running = true;
        thread = Thread.ofVirtual().name("telemetry-ingest").start(this::loop);
        log.info("ingest worker 已启动（consumer={}）", consumerName);
    }

    @Override
    public void stop() {
        running = false;
        if (thread != null) {
            thread.interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    private void loop() {
        while (running) {
            boolean worked = false;
            for (String kind : kinds()) {
                if (!running) {
                    return;
                }
                try {
                    worked |= poll(kind);
                } catch (RuntimeException e) {
                    // Redis 抖一下不能让 worker 线程死掉；重连由客户端负责
                    log.warn("poll {} 失败：{}", kind, e.toString());
                }
            }
            if (!worked) {
                idle();
            }
        }
    }

    /** 每 5 秒扫一次 stream 前缀。用 SCAN 不用 KEYS：后者在大库上会阻塞 Redis。 */
    private Set<String> kinds() {
        long now = System.currentTimeMillis();
        if (now - kindsRefreshedAt < KINDS_REFRESH.toMillis()) {
            return kinds;
        }
        Set<String> discovered = ConcurrentHashMap.newKeySet();
        try (Cursor<String> cursor = redis.scan(
                ScanOptions.scanOptions().match(STREAM_PREFIX + "*").count(100).build())) {
            cursor.forEachRemaining(key -> discovered.add(key.substring(STREAM_PREFIX.length())));
        }
        kinds = discovered;
        kindsRefreshedAt = now;
        return discovered;
    }

    private boolean poll(String kind) {
        String stream = STREAM_PREFIX + kind;
        if (!ensureGroup(stream)) {
            return false;
        }
        if (pendingDrained.add(kind)) {
            drainPending(kind, stream);
        }
        List<MapRecord<String, Object, Object>> records = redis.opsForStream()
                .read(
                        Consumer.from(GROUP, consumerName),
                        StreamReadOptions.empty().count(BATCH),
                        StreamOffset.create(stream, ReadOffset.lastConsumed()));
        if (records == null || records.isEmpty()) {
            return false;
        }
        records.forEach(record -> handle(kind, stream, record));
        return true;
    }

    /** 启动后先把自己上次没 ACK 的读一遍：这就是"崩溃不丢"的实现。 */
    private void drainPending(String kind, String stream) {
        int drained = 0;
        while (running && drained < MAX_DRAIN) {
            List<MapRecord<String, Object, Object>> pending = redis.opsForStream()
                    .read(
                            Consumer.from(GROUP, consumerName),
                            StreamReadOptions.empty().count(BATCH),
                            StreamOffset.create(stream, ReadOffset.from("0")));
            if (pending == null || pending.isEmpty()) {
                return;
            }
            pending.forEach(record -> handle(kind, stream, record));
            drained += pending.size();
        }
    }

    /**
     * 建消费组。三种结果都正常：建成功、已存在、stream 还没被写过（等下一轮）。
     *
     * <p>**不能靠异常文本判断"已存在"**（这一版实现就这么错过一次：重启后所有消费静默停止，
     * 因为包装后的 message 里没有 {@code BUSYGROUP} 字样）。不同 Spring Data / Redis 版本的
     * 异常措辞不一样，而"静默不消费"是最难发现的一种故障。所以统一靠"组在不在"这个事实判断。
     */
    private boolean ensureGroup(String stream) {
        if (groupsReady.contains(stream)) {
            return true;
        }
        try {
            redis.opsForStream().createGroup(stream, ReadOffset.from("0"), GROUP);
        } catch (RuntimeException e) {
            if (!groupExists(stream)) {
                // 最常见的原因是 stream 还不存在（relay 一条都没收到），下一轮再试
                log.debug("消费组未就绪（{}）：{}", stream, e.toString());
                return false;
            }
        }
        groupsReady.add(stream);
        return true;
    }

    private boolean groupExists(String stream) {
        try {
            return redis.opsForStream().groups(stream).stream()
                    .anyMatch(group -> GROUP.equals(group.groupName()));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void handle(String kind, String stream, MapRecord<String, Object, Object> record) {
        // StringRedisTemplate#opsForStream 的泛型是 <String, Object, Object>，取出来自己做窄化
        Map<Object, Object> value = record.getValue();
        Object projectId = value.get("projectId");
        Object payload = value.get("payload");
        String project = projectId == null ? "unknown" : projectId.toString();
        try {
            if (projectId == null || payload == null) {
                drops.increment(project, kind, "missing_fields");
                return;
            }
            dispatch(project, kind, payload.toString());
        } catch (RuntimeException e) {
            // 记 dropped 而不是留着重试：坏数据重试一万次还是坏的
            log.error("处理 {} 失败（记 dropped 后 ACK）", kind, e);
            drops.increment(project, kind, "processing_error");
        } finally {
            redis.opsForStream().acknowledge(stream, GROUP, record.getId());
        }
    }

    private void dispatch(String projectId, String kind, String payload) {
        switch (kind) {
            case "event" -> ingestEvent(projectId, payload);
            case "transaction" -> ingestTransaction(projectId, payload);
            case "release" -> ingestRelease(projectId, payload);
            default -> storeRaw(projectId, kind, payload);
        }
    }

    private void ingestEvent(String projectId, String payload) {
        NormalizeResult result = normalizer.normalize(projectId, payload, Instant.now());
        if (result instanceof NormalizeResult.Drop drop) {
            drops.increment(projectId, "event", drop.reason());
            return;
        }
        NormalizedEvent normalized = ((NormalizeResult.Ok) result).event();
        String fingerprint = fingerprinter.fingerprint(normalized.fingerprintInput());
        EventRecord event = normalized.event().withFingerprint(fingerprint);
        IssueEvent issue = normalized.issue().withFingerprint(fingerprint);

        tx.executeWithoutResult(status -> {
            if (!events.append(event)) {
                log.debug("重复投递，跳过计数：{}", event.eventId());
                return;
            }
            long issueId = issues.record(issue);
            events.linkIssue(event.projectId(), event.eventId(), issueId);
        });
    }

    /**
     * transaction 只落库、不分组、不建 issue。
     *
     * <p>它和 error 的差别不只是字段：error 的写入是"插入 + 聚合成 issue + 回填关联"的三件事，
     * 而 transaction 是单条插入——所以这里不需要显式事务，autocommit 就是原子操作。
     * 顺便也说明为什么不能把两者塞进同一个方法。
     */
    private void ingestTransaction(String projectId, String payload) {
        TransactionNormalizer.TransactionResult result = transactions.normalize(projectId, payload, Instant.now());
        if (result instanceof TransactionNormalizer.TransactionResult.Drop drop) {
            drops.increment(projectId, "transaction", drop.reason());
            return;
        }
        EventRecord event = ((TransactionNormalizer.TransactionResult.Ok) result).event();
        if (!events.append(event)) {
            log.debug("重复投递的 transaction，跳过：{}", event.eventId());
        }
    }

    private void ingestRelease(String projectId, String payload) {
        JsonNode root = json.readTree(payload);
        JsonNode version = root.path("release").path("version");
        if (!version.isString()) {
            version = root.path("version");
        }
        if (!version.isString() || version.asString().isBlank()) {
            drops.increment(projectId, "release", "missing_version");
            return;
        }
        releases.record(projectId, version.asString());
    }

    /** 原始类 item：没有天然主键，用内容哈希当幂等键，重投不会变成两行。 */
    private void storeRaw(String projectId, String kind, String payload) {
        EventRecord raw = new EventRecord(
                projectId,
                Ids.contentId(payload),
                Instant.now(),
                kind,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                payload);
        if (!events.append(raw)) {
            log.debug("重复投递（{}），跳过", kind);
        }
    }

    private void idle() {
        try {
            Thread.sleep(IDLE);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            running = false;
        }
    }
}
