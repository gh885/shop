/**
 * permissions codegen：`contracts/permissions.yaml` 是唯一真相源，这里生成两份投影。
 *
 *   1. `apps/server/src/main/java/com/shop/platform/infra/security/Permission.java`（后端枚举）
 *   2. `packages/common/src/contract/permission-codes.ts`（前端常量 + 联合类型）
 *
 * 为什么生成 Java 而不是手写：手写枚举 + 启动对拍是"两份清单 + 一道门"，门能挡住漂移但不消除它。
 * 生成之后结构上不可能漂——这是把"靠对拍兜着"换成"没有第二份"。
 *
 * 为什么源不在数据库里：一次改名/重构时，DB 为真相源意味着代码里每个检查点都是字符串字面量，
 * 编译器一个都不提示。**必须被写下来的是"在哪里检查这个码"**，检查点不可替代；
 * "库里有哪些码"可以由检查点完整重建。让可重建的东西当源，方向是反的。
 *
 * 边界（有意不做）：
 * - **不生成数据库种子**。角色 → 权限的分配是授权事实，由迁移显式写；从清单推导会变成
 *   "文档驱动授权"，而授权该由人拍。
 * - **不校验动作词表**。动词是资源局部的（`refund` 有意义、`execute` 没意义），
 *   资源内唯一 + 最多 5 个 + 不许带宾语，这三条已能挡住绝大多数坏名字。
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseDocument } from "yaml"
import { z } from "zod"

import { out } from "../lib/out.mjs"

const ROOT = resolve(import.meta.dirname, "..", "..")
const SOURCE = resolve(ROOT, "contracts", "permissions.yaml")
const TS_TARGET = resolve(ROOT, "packages", "common", "src", "contract", "permission-codes.ts")
const JAVA_TARGET = resolve(
    ROOT,
    "apps",
    "server",
    "src",
    "main",
    "java",
    "com",
    "shop",
    "platform",
    "infra",
    "security",
    "Permission.java",
)

const CHECK = process.argv.includes("--check")

/** 动作名：小写蛇形，**不许带宾语**。`refund` ✅ / `approve_refund` ❌ */
const ACTION_NAME = /^[a-z][a-z0-9]*$/
/** 资源名：小写蛇形，必须是可数名词 */
const RESOURCE_NAME = /^[a-z][a-z0-9_]*$/

const action = z.strictObject({
    name: z
        .string()
        .regex(ACTION_NAME, "动作名必须是小写单词、不带宾语（refund 而不是 approve_refund）"),
    label: z.string(),
    pool: z.enum(["merchant", "platform", "both"]),
    risk: z.enum(["normal", "high"]).optional(),
    assignable: z.boolean().optional(),
})

const resource = z.strictObject({
    name: z
        .string()
        .regex(RESOURCE_NAME, "资源名必须是可数名词（after_sale_case 而不是 after_sale）"),
    label: z.string(),
    scope: z.enum(["none", "merchant", "shop"]),
    actions: z
        .array(action)
        .min(1, "资源至少要有一个动作")
        .max(5, "一个资源最多 5 个动作——超过说明它该拆"),
})

const schema = z.strictObject({
    version: z.literal(1),
    resources: z.array(resource).min(1),
    /** 平台岗位 → 权限码。从代码推导，不进库（见 yaml 底部注释） */
    staff_roles: z.record(z.string(), z.array(z.string())).optional(),
})

/** yaml 一行 → 一个权限码。枚举名 = 资源_动作 大写下划线，码 = `resource:action`。 */
function flatten(entries) {
    const codes = []
    const seen = new Set()
    for (const res of entries.resources) {
        const actionNames = new Set()
        for (const act of res.actions) {
            if (actionNames.has(act.name)) {
                throw new Error(`资源 ${res.name} 里动作 ${act.name} 重复`)
            }
            actionNames.add(act.name)

            const code = `${res.name}:${act.name}`
            if (seen.has(code)) {
                throw new Error(`权限码 ${code} 重复`)
            }
            seen.add(code)
            codes.push({
                code,
                enumName: `${res.name}_${act.name}`.toUpperCase(),
                resource: res.name,
                scope: res.scope,
                action: act.name,
                label: act.label,
                pool: act.pool,
                highRisk: act.risk === "high",
                assignable: act.assignable === true,
            })
        }
    }
    return codes
}

async function readEntries() {
    const doc = parseDocument(await readFile(SOURCE, "utf8"))
    if (doc.errors.length > 0) {
        throw new Error(`permissions.yaml 解析失败: ${doc.errors.map((e) => e.message).join("; ")}`)
    }
    const parsed = schema.safeParse(doc.toJSON())
    if (!parsed.success) {
        throw new Error(
            `permissions.yaml 结构不合法:\n${parsed.error.issues
                .map((i) => `  ${i.path.join(".")}: ${i.message}`)
                .join("\n")}`,
        )
    }
    return parsed.data
}

const SCOPE_ZH = {
    none: "无范围（平台级）",
    merchant: "本商家",
    shop: "授权的店集合",
}

function renderTs(codes) {
    const lines = codes.map((item) => {
        const doc = [
            item.label,
            "",
            `@scope ${SCOPE_ZH[item.scope]}`,
            ...(item.highRisk ? ["@risk high"] : []),
            ...(item.assignable ? ["@assignable 商家可转授给子账号"] : []),
        ]
            .map((line) => (line ? `     * ${line}` : "     *"))
            .join("\n")
        return `    /**\n${doc}\n     */\n    ${item.enumName}: "${item.code}",`
    })

    return `/**
 * 权限码。**本文件由 \`scripts/contracts/permissions-codegen.mjs\` 从 \`contracts/permissions.yaml\`
 * 生成，不要手改。** 跑 \`pnpm permissions:gen\` 重生成，\`pnpm permissions:drift\` 校验（pre-push 门禁）。
 *
 * 键是枚举名（大写），值是权限码（\`resource:action\`）。判权时比对的是**值**，键只是给人读的。
 *
 * **前端不需要"系统里有哪些权限"这份全集**——它需要的是 ① 当前用户的有效权限集（接口返回）
 * ② 一个联合类型（防拼错）。后者由本文件的 \`PermissionCode\` 提供。
 */
export const PermissionCodes = {
${lines.join("\n")}
} as const

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes]
`
}
// 模板刻意**不再**导出 ALL_PERMISSION_CODES：aa14e51e 断开 common 循环依赖时把它从
// 生成物里删掉了（全仓零消费者，缺 permission 时的提示由后端 missing_permission 承担），
// 当时只删了文件没删模板，permissions-drift 从此在 HEAD 上恒红、拦下所有 push。
// 模板跟随现状，而不是 regen 把导出加回去。

function renderJava(codes) {
    const constants = codes
        .map((item) => {
            const pool = {
                merchant: "Pool.MERCHANT",
                platform: "Pool.PLATFORM",
                both: "Pool.BOTH",
            }[item.pool]
            const risk = item.highRisk ? "Risk.HIGH" : "Risk.NORMAL"
            const grant = item.assignable ? "Grant.GRANTABLE" : "Grant.OWNER_ONLY"
            const comment = item.label + (item.highRisk ? "（高风险）" : "")
            return `    /** ${comment} */\n    ${item.enumName}("${item.code}", Scope.${item.scope.toUpperCase()}, ${pool}, ${risk}, ${grant}),`
        })
        .join("\n")

    const staffBlock = Object.entries(staffRoles)
        .map(([role, roleCodes]) => {
            const set = roleCodes.map((code) => `"${code}"`).join(", ")
            return `            Map.entry("${role}", Set.of(${set}))`
        })
        .join(",\n")

    const staffRolesDecl =
        Object.keys(staffRoles).length === 0
            ? "    private static final Map<String, Set<String>> STAFF_ROLES = Map.of();"
            : "    private static final Map<String, Set<String>> STAFF_ROLES = Map.ofEntries(\n" +
              staffBlock +
              ");"

    return `package com.shop.platform.infra.security;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 全局权限点。<b>本文件由 {@code scripts/contracts/permissions-codegen.mjs} 从
 * {@code contracts/permissions.yaml} 生成，不要手改。</b>
 *
 * <p>生成的而不是手写的：手写枚举 + 启动对拍是"两份清单 + 一道门"，门能挡住漂移但不消除它。
 * 生成之后结构上不可能漂——"这个码存在吗"只有一个答案。
 *
 * <p><b>码只有一种形态：{@code resource:action}，小写。</b>判权时它是不透明原子，不解析；
 * {@link #resource()} 是冗余视图，从码推导，不单独存。
 *
 * <p>构造参数与 yaml 的列一一对应（scope / pool / risk / 可转授）。后两维用
 * {@link Risk} / {@link Grant} 枚举常量而不是布尔：四十多个常量排下来，
 * {@code false, true} 无法复查、相邻两行交换也看不出来，具名常量可以。
 *
 * <p>{@link Pool} 是"这个码在哪个主体池里有意义"，是集合不是排他域：{@code order:read} 是
 * {@link Pool#BOTH}——商家读自己的单、平台读全平台的单，同一个码。标成排他域就得新增
 * {@code ORDER_READ_ADMIN}，同一件事两个码必然漂。它唯一的用途是推导主账号的权限集合。
 *
 * <p>{@link Scope} 是商家侧的范围求值方式。平台主体无视它——平台不在任何租户里，范围恒为全平台。
 */
public enum Permission {
${constants};

    /** 这个码在哪个主体池里有意义。集合语义：BOTH = 两侧都能持有同一个码。 */
    public enum Pool {
        MERCHANT,
        PLATFORM,
        BOTH;

        public boolean coversMerchant() {
            return this == MERCHANT || this == BOTH;
        }

        public boolean coversPlatform() {
            return this == PLATFORM || this == BOTH;
        }
    }

    /** 商家侧的范围求值方式。都是符号值，不枚举具体行。 */
    public enum Scope {
        /** 无范围，平台级 */
        NONE,
        /** 本商家（由归属推导，不配置） */
        MERCHANT,
        /** 授权的店集合；ALL 时生成 SQL 不加 shop 谓词 */
        SHOP
    }

    /** 动作的爆炸半径：high = 一次操作能改变别人的钱 / 全平台可见状态 / 封停账号 / 管钥匙。 */
    public enum Risk {
        NORMAL,
        HIGH
    }

    /** 商家能不能把这个码授给子账号。与 {@link Risk} 不是一回事：动自己的钱的码 high 但可转授。 */
    public enum Grant {
        /** 只有主账号持有，不进任何商家角色 */
        OWNER_ONLY,
        /** 可进子账号可授予清单 */
        GRANTABLE
    }

    private final String code;
    private final Scope scope;
    private final Pool pool;
    private final Risk risk;
    private final Grant grant;

    Permission(String code, Scope scope, Pool pool, Risk risk, Grant grant) {
        this.code = code;
        this.scope = scope;
        this.pool = pool;
        this.risk = risk;
        this.grant = grant;
    }

    public String code() {
        return code;
    }

    /** 码的 resource 段，从码本身推导——码是 {@code resource:action}，再存一份只会漂。 */
    public String resource() {
        return code.substring(0, code.indexOf(':'));
    }

    public Scope scope() {
        return scope;
    }

    public Pool pool() {
        return pool;
    }

    /** 动钱、动全平台可见状态、封停账号、管钥匙。岗位到高危码的授予在 {@code staff_roles} 逐条显式写。 */
    public boolean highRisk() {
        return risk == Risk.HIGH;
    }

    /** 商家能不能把它授给子账号。与 {@link #highRisk()} 不是一回事。 */
    public boolean assignable() {
        return grant == Grant.GRANTABLE;
    }

    /** 全部码。库里出现的码必须 ⊆ 这个集合。 */
    public static Set<String> codes() {
        return Arrays.stream(values()).map(Permission::code).collect(Collectors.toUnmodifiableSet());
    }

    /** 商家子账号可持有的码（角色里出现集合外的码 → 越权）。 */
    public static Set<String> assignableCodes() {
        return Arrays.stream(values())
                .filter(Permission::assignable)
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());
    }

    /** 商家主体能持有的全部码 = 主账号的权限集合。 */
    public static Set<String> merchantPoolCodes() {
        return Arrays.stream(values())
                .filter(permission -> permission.pool.coversMerchant())
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * 平台岗位 → 权限码。**从代码推导，不查库**——种子行漏同步是静默失权，删表是全体失权。
     * {@code SUPER_ADMIN} 不在这张表里：它的集合恒等于 {@link #codes()}。
     */
${staffRolesDecl}

    public static Set<String> staffRoleCodes(String role) {
        if ("SUPER_ADMIN".equals(role)) {
            return codes();
        }
        return STAFF_ROLES.getOrDefault(role, Set.of());
    }
}
`
}

const entries = await readEntries()
const codes = flatten(entries)

// 岗位引用的码必须在清单里；拼错一个字母就是静默失权
const known = new Set(codes.map((item) => item.code))
const staffRoles = entries.staff_roles ?? {}
for (const [role, roleCodes] of Object.entries(staffRoles)) {
    for (const code of roleCodes) {
        if (!known.has(code)) {
            throw new Error(`staff_roles.${role} 引用了清单里没有的码: ${code}`)
        }
    }
}
const ts = renderTs(codes)
const java = renderJava(codes)

if (CHECK) {
    let stale = false
    for (const [path, expected, name] of [
        [TS_TARGET, ts, "permission-codes.ts"],
        [JAVA_TARGET, java, "Permission.java"],
    ]) {
        const current = await readFile(path, "utf8").catch(() => null)
        if (current !== expected) {
            out("permissions:drift").err(
                `${name} 与 contracts/permissions.yaml 不一致，跑 \`pnpm permissions:gen\``,
            )
            stale = true
        }
    }
    if (stale) {
        process.exit(1)
    }
    out("permissions:drift").ok(`${codes.length} 个权限码，两份生成物与 yaml 一致`)
} else {
    await writeFile(TS_TARGET, ts, "utf8")
    await writeFile(JAVA_TARGET, java, "utf8")
    const resources = new Set(codes.map((item) => item.resource)).size
    out("permissions:gen").ok(
        `生成 ${codes.length} 个权限码（${resources} 个资源）→ Permission.java + permission-codes.ts`,
    )
}
