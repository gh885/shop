#!/usr/bin/env node
/**
 * 把仓库里的可观测性资产同步到 Grafana Cloud —— 生产形态的「看板 + 告警 + 通知」三件套。
 *
 * 做什么（全部幂等，重跑只覆盖不新增）：
 *   1. 文件夹 Shop（uid=shop）
 *   2. 看板：deploy/observability/grafana/dashboards/*.json，数据源引用由本机的 shop-prometheus 换成云端 Prometheus
 *   3. 告警：deploy/observability/prometheus/shop-alerts.yml → Grafana-managed 规则（convert API）。
 *      Grafana 导入时会补 prometheus_math / threshold 表达式保住 Prometheus 语义：查无数据 = Normal，
 *      不是 NoData，所以不会在上线前被 NoData 刷屏。导入后的规则是 provisioned（UI 只读）：改仓库、重跑本脚本。
 *   4. 通知：email contact point（GRAFANA_CLOUD_ALERT_EMAIL）+ 默认路由，分组与间隔对齐 alertmanager/alertmanager.yml
 *      Grafana Cloud 只允许给 org 成员的邮箱发告警：收件邮箱要么就是注册邮箱，要么先邀请进 org。
 *
 * 用法：
 *   node scripts/obs-cloud-sync.mjs            # 同步，规则启用
 *   node scripts/obs-cloud-sync.mjs --pause    # 同步，规则整体暂停 —— 主机上线前用：本机采集一停，
 *                                              #   absent() 类规则（任务停摆）会按设计空叫；上线当天不带 --pause 重跑即启用
 *
 * 凭据：deploy/observability/.env.local（gitignored）的 GRAFANA_CLOUD_STACK_URL / GRAFANA_CLOUD_SA_TOKEN /
 *       GRAFANA_CLOUD_ALERT_EMAIL。只读文件、只进请求头，不打印。
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadDevEnv } from "./dotenv.mjs"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OBS = path.join(ROOT, "deploy", "observability")
const PAUSE = process.argv.includes("--pause")
const FOLDER = { uid: "shop", title: "Shop" }
const RECEIVER = "shop-email"

loadDevEnv(path.join(OBS, ".env.local"))
function need(key) {
    const v = process.env[key]
    if (!v) {
        console.error(
            `✖ 缺 ${key}：填 deploy/observability/.env.local（模板见同目录 .env.example）`,
        )
        process.exit(1)
    }
    return v
}
const BASE = need("GRAFANA_CLOUD_STACK_URL").replace(/\/+$/, "")
const TOKEN = need("GRAFANA_CLOUD_SA_TOKEN")
const EMAIL = need("GRAFANA_CLOUD_ALERT_EMAIL")

/** 统一请求：Bearer 鉴权；body 为对象时按 JSON 发，raw=true 时原样发（YAML 用） */
async function api(method, p, { body, headers = {}, raw = false, allow = [] } = {}) {
    const init = {
        method,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
    }
    if (body !== undefined) init.body = raw ? body : JSON.stringify(body)
    const res = await fetch(BASE + p, init)
    const text = await res.text()
    if (!res.ok && !allow.includes(res.status)) {
        throw new Error(`${method} ${p} → HTTP ${res.status}：${text.slice(0, 400)}`)
    }
    let json = null
    try {
        json = JSON.parse(text)
    } catch {
        /* 202 等空响应 */
    }
    return { status: res.status, json }
}

async function main() {
    // ── 0. 云端 Prometheus 数据源 ─────────────────────────────────────────────
    const dsRes = await api("GET", "/api/datasources")
    const proms = dsRes.json.filter((d) => d.type === "prometheus")
    const prom =
        proms.find((d) => d.uid === "grafanacloud-prom") ??
        proms.find((d) => d.name.endsWith("-prom")) ??
        proms[0]
    if (!prom) throw new Error("云端没有 prometheus 类型的数据源")
    console.log(`· 云端 Prometheus 数据源：uid=${prom.uid}`)

    // ── 1. 文件夹 ─────────────────────────────────────────────────────────────
    const got = await api("GET", `/api/folders/${FOLDER.uid}`, { allow: [404] })
    if (got.status === 404) {
        await api("POST", "/api/folders", { body: FOLDER })
        console.log(`· 文件夹 ${FOLDER.title}：新建`)
    } else {
        console.log(`· 文件夹 ${FOLDER.title}：已存在`)
    }

    // ── 2. 看板 ───────────────────────────────────────────────────────────────
    const dir = path.join(OBS, "grafana", "dashboards")
    const files = readdirSync(dir)
        .filter((n) => n.endsWith(".json"))
        .toSorted()
    const pushed = await Promise.all(
        files.map(async (f) => {
            const text = readFileSync(path.join(dir, f), "utf8")
                // 字符串型引用（按名字找数据源）先改成对象型，再统一换 uid
                .replaceAll(
                    /"datasource":\s*"shop-prometheus"/g,
                    `"datasource": {"type": "prometheus", "uid": "shop-prometheus"}`,
                )
                .replaceAll('"shop-prometheus"', JSON.stringify(prom.uid))
            const dashboard = JSON.parse(text)
            for (const k of ["__inputs", "__requires", "__elements"]) delete dashboard[k]
            dashboard.id = null // 按 uid 匹配覆盖，id 由云端分配
            const r = await api("POST", "/api/dashboards/db", {
                body: {
                    dashboard,
                    folderUid: FOLDER.uid,
                    overwrite: true,
                    message: "obs-cloud-sync",
                },
            })
            return `· 看板 ${dashboard.title} → ${r.json?.url ?? "(ok)"}`
        }),
    )
    for (const line of pushed) console.log(line)

    // ── 3. 告警规则（Prometheus 规则文件 → Grafana-managed）───────────────────
    const yml = readFileSync(path.join(OBS, "prometheus", "shop-alerts.yml"), "utf8")
    const at = yml.search(/^groups:\s*$/m)
    if (at < 0) throw new Error("shop-alerts.yml 没有顶层 groups:")
    // convert API 的 body 是「命名空间（=文件夹标题）→ 规则组列表」；groups: 之后的行本来就是缩进好的列表，整体挂到 Shop: 下即可。别传 X-Grafana-Alerting-Folder-UID：它会被当父目录、在 Shop 下再嵌一层 Shop 子目录
    const body = `${FOLDER.title}:\n${yml.slice(yml.indexOf("\n", at) + 1)}`
    const headers = {
        "Content-Type": "application/yaml",
        "X-Grafana-Alerting-Datasource-UID": prom.uid,
        ...(PAUSE ? { "X-Grafana-Alerting-Alert-Rules-Paused": "true" } : {}),
    }
    const conv = await api("POST", "/api/convert/prometheus/config/v1/rules", {
        raw: true,
        body,
        headers,
    })
    console.log(`· 告警规则导入 → HTTP ${conv.status}${PAUSE ? "（暂停态）" : ""}`)

    // ── 4. 通知：contact point + 默认路由 ─────────────────────────────────────
    const cpRes = await api("GET", "/api/v1/provisioning/contact-points")
    const cps = cpRes.json
    const existing = cps.find((c) => c.name === RECEIVER)
    const cp = {
        name: RECEIVER,
        type: "email",
        settings: { addresses: EMAIL, singleEmail: false },
        disableResolveMessage: false,
    }
    try {
        if (existing) {
            await api("PUT", `/api/v1/provisioning/contact-points/${existing.uid}`, {
                body: { ...cp, uid: existing.uid },
            })
            console.log(`· contact point ${RECEIVER}：更新`)
        } else {
            await api("POST", "/api/v1/provisioning/contact-points", { body: cp })
            console.log(`· contact point ${RECEIVER}：新建`)
        }
    } catch (error) {
        if (error.message.includes("not members of this organization")) {
            throw new Error(
                "Grafana Cloud 只允许给 org 成员的邮箱发告警。两条路：① 把 GRAFANA_CLOUD_ALERT_EMAIL 改成你注册 Grafana Cloud 的那个邮箱；" +
                    "② 到 Administration → Users and access → Users 邀请这个邮箱加入 org，对方接受邀请后再跑。",
                { cause: error },
            )
        }
        throw error
    }
    // 根路由：所有告警默认走邮件；分组键与间隔对齐本机 alertmanager.yml
    await api("PUT", "/api/v1/provisioning/policies", {
        body: {
            receiver: RECEIVER,
            group_by: ["alertname", "application", "env"],
            group_wait: "30s",
            group_interval: "5m",
            repeat_interval: "4h",
        },
    })
    console.log("· 默认通知路由 → shop-email（group_by alertname/application/env，30s/5m/4h）")

    // ── 5. 回读核对 ───────────────────────────────────────────────────────────
    const dashRes = await api("GET", `/api/search?type=dash-db&folderUIDs=${FOLDER.uid}`)
    const dashes = dashRes.json
    const rulesRes = await api("GET", "/api/v1/provisioning/alert-rules")
    const rules = rulesRes.json.filter((r) => r.folderUID === FOLDER.uid)
    const policyRes = await api("GET", "/api/v1/provisioning/policies")
    const policy = policyRes.json
    console.log("\n== 回读 ==")
    console.log(`看板 ${dashes.length} 块：${dashes.map((d) => d.title).join("、")}`)
    console.log(
        `规则 ${rules.length} 条：${rules.map((r) => `${r.title}${r.isPaused ? "(暂停)" : ""}`).join("、")}`,
    )
    console.log(`根路由 receiver=${policy.receiver}`)
    const bad = []
    if (dashes.length !== files.length) bad.push(`看板数 ${dashes.length} ≠ 文件数 ${files.length}`)
    const expectRules = (yml.match(/^\s*- alert:/gm) ?? []).length
    if (rules.length !== expectRules) bad.push(`规则数 ${rules.length} ≠ 文件里 ${expectRules}`)
    if (policy.receiver !== RECEIVER) bad.push(`根路由 receiver=${policy.receiver}`)
    if (bad.length > 0) {
        console.error(`✖ 核对不过：${bad.join("；")}`)
        process.exit(1)
    }
    console.log("✓ 全部对上")
}

try {
    await main()
} catch (error) {
    console.error(`✖ ${error.message}`)
    process.exit(1)
}
