import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { asList, asRecord, field, isRecord } from "./api"
import { MANIFEST_PATH } from "./env"

/**
 * 一轮 E2E 的清单：globalSetup 造完数写出，测试与 CI 诊断产物读同一份。
 * 有了它，测试里不再出现任何写死的手机号 / 店铺 / 订单号 / 运单号。
 */
export interface RunManifest {
    runId: string
    seller: { phone: string; password: string; shopId: string; shopName: string }
    buyer: { phone: string; password: string; addressId: string }
    product: {
        productId: string
        skuId: string
        name: string
        skuName: string
        /** 分 */
        price: number
        attributes: { name: string; value: string }[]
    }
    order: { orderId: string; orderNo: string }
    trackingNo: string
    createdAt: string
}

export async function writeManifest(manifest: RunManifest): Promise<void> {
    await mkdir(dirname(MANIFEST_PATH), { recursive: true })
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, undefined, 2)}\n`, "utf8")
}

let cached: RunManifest | undefined

/**
 * 测试侧读取（每 worker 一次）；缺文件说明 globalSetup 没跑成，直接炸在读取点而不是后面某句断言。
 *
 * 逐字段点名取值、不做整体类型断言：e2e 不是 workspace 包，`pnpm typecheck` 照不到这里，
 * 清单少个字段只能在读取处拦；让它顺着 `as` 漏进测试，就变成一句查不出原因的 undefined 匹配。
 */
export async function readManifest(): Promise<RunManifest> {
    if (cached) return cached
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown
    const root = asRecord(parsed, MANIFEST_PATH)
    cached = {
        runId: text(root, "runId"),
        seller: {
            phone: text(root, "seller.phone"),
            password: text(root, "seller.password"),
            shopId: text(root, "seller.shopId"),
            shopName: text(root, "seller.shopName"),
        },
        buyer: {
            phone: text(root, "buyer.phone"),
            password: text(root, "buyer.password"),
            addressId: text(root, "buyer.addressId"),
        },
        product: {
            productId: text(root, "product.productId"),
            skuId: text(root, "product.skuId"),
            name: text(root, "product.name"),
            skuName: text(root, "product.skuName"),
            price: number(root, "product.price"),
            attributes: list(root, "product.attributes").map((attr, index) => ({
                name: field(attr, "name", `attributes[${index}]`),
                value: field(attr, "value", `attributes[${index}]`),
            })),
        },
        order: { orderId: text(root, "order.orderId"), orderNo: text(root, "order.orderNo") },
        trackingNo: text(root, "trackingNo"),
        createdAt: text(root, "createdAt"),
    }
    return cached
}

/** 点分路径 → { 装叶子的那层对象, 叶子 key }；中间任何一段不是对象，就在整条路径上报缺失 */
function leaf(
    root: Record<string, unknown>,
    path: string,
): { holder: Record<string, unknown>; key: string } {
    const keys = path.split(".")
    const key = keys.pop() ?? ""
    const walked = keys.reduce((source: unknown, segment) => walk(source, segment), root)
    return { holder: asRecord(walked, path), key }
}

function walk(source: unknown, key: string): unknown {
    return isRecord(source) ? source[key] : undefined
}

function text(root: Record<string, unknown>, path: string): string {
    const { holder, key } = leaf(root, path)
    return field(holder, key, path)
}

function number(root: Record<string, unknown>, path: string): number {
    const { holder, key } = leaf(root, path)
    const value = holder[key]
    if (typeof value !== "number") throw new Error(`${path} 不是数字：${JSON.stringify(value)}`)
    return value
}

function list(root: Record<string, unknown>, path: string): Record<string, unknown>[] {
    const { holder, key } = leaf(root, path)
    return asList(holder[key], path)
}
