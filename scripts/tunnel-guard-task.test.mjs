import { describe, expect, it } from "vite-plus/test"
import { classifyTaskQuery } from "./tunnel-guard-task.mjs"

/**
 * 只测纯判定：`classifyTaskQuery` 把一次 schtasks 结果分成三态。
 * 真实 schtasks 调用不测（它依赖 Windows 计划任务与权限，跑在 CI 的 Linux 上必然 unknown）。
 */
describe("classifyTaskQuery", () => {
    it("命令跑起来且退出 0 = 已注册", () => {
        expect(classifyTaskQuery({ spawned: true, code: 0 })).toBe("installed")
    })

    it("命令跑起来但退出非 0 = 确认不存在（任务没装 / 无权限）", () => {
        expect(classifyTaskQuery({ spawned: true, code: 1 })).toBe("absent")
    })

    it("命令没跑起来 = 查不到，不能读作「没装」", () => {
        // spawnSync 起不来进程（沙箱黑名单 / EPERM）时 status 是 null，code 被折成 1——
        // 只看 code 就会把「没问成」谎报成「未注册」，这正是要防的假阴性
        expect(classifyTaskQuery({ spawned: false, code: 1 })).toBe("unknown")
        expect(classifyTaskQuery({ spawned: false, code: 9009 })).toBe("unknown")
    })
})
