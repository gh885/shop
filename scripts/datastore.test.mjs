import { createServer } from "node:net"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { datastoreMode, datastoreTargets, isOpen } from "./datastore.mjs"

const ENV_KEYS = ["SHOP_DB_PORT", "SHOP_REDIS_PORT", "SHOP_DATASTORE"]
/** 备份调用前的 env，afterEach 还原：这几个键被 .env / 命令行设过，测试不能把它们抹给别的用例 */
const saved = {}

beforeEach(() => {
    for (const key of ENV_KEYS) {
        saved[key] = process.env[key]
        delete process.env[key]
    }
})
afterEach(() => {
    for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
    }
})

describe("datastoreTargets", () => {
    it("仓库默认端口：PG 15432、Redis 6379", () => {
        expect(datastoreTargets()).toEqual([
            { name: "PostgreSQL", port: 15432 },
            { name: "Redis", port: 6379 },
        ])
    })
    it("SHOP_DB_PORT / SHOP_REDIS_PORT 覆盖生效", () => {
        process.env.SHOP_DB_PORT = "15599"
        process.env.SHOP_REDIS_PORT = "7379"
        expect(datastoreTargets().map((t) => t.port)).toEqual([15599, 7379])
    })
})

describe("datastoreMode", () => {
    it("默认 remote（数据面在云上）", () => {
        expect(datastoreMode()).toBe("remote")
    })
    it("SHOP_DATASTORE 显式覆盖", () => {
        process.env.SHOP_DATASTORE = "wsl"
        expect(datastoreMode()).toBe("wsl")
    })
})

describe("isOpen", () => {
    it("有人在听 = true", async () => {
        const server = createServer()
        await new Promise((r) => server.listen(0, "127.0.0.1", r))
        const { port } = server.address()
        await expect(isOpen(port, 500)).resolves.toBe(true)
        server.close()
    })
    it("没人听 = false（端口先 bind 再释放，连它必拒）", async () => {
        const server = createServer()
        await new Promise((r) => server.listen(0, "127.0.0.1", r))
        const { port } = server.address()
        await new Promise((r) => server.close(r))
        await expect(isOpen(port, 300)).resolves.toBe(false)
    })
})
