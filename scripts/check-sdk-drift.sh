#!/usr/bin/env bash
# 契约漂移检查（lefthook pre-push，见 lefthook.yml）：
#   1) 离线部分：用已提交的 openapi/api-docs.json 重新生成 SDK（含 zod 校验 schema），
#      与提交的生成物比对 —— 保证 src/sdk 与契约文件同步；
#   2) 在线部分：若本地后端在跑，再比对运行中后端的 /v3/api-docs 与提交的契约文件 ——
#      保证契约文件本身没有落后于代码。后端没起就跳过，不阻塞推送。
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# ---- 1) SDK 生成物 vs 提交的 api-docs.json（离线）----
# 生成到临时目录只比对，绝不写 src/sdk：openapi-ts 落笔前会 rmSync 整个输出目录，
# 而 pre-push 是 parallel 的 —— tsc/oxlint/vitest 正开着那里的文件时 Windows 删除报
# EPERM，旧文件已删、新文件没写完，半截生成物会把 typecheck/lint/test 一起带红（实测）。
tmp_sdk=$(mktemp -d)
trap 'rm -rf "$tmp_sdk"' EXIT
(cd packages/api && npx @hey-api/openapi-ts --no-log-file -o "$tmp_sdk" >/dev/null)
if diff_out=$(diff -r packages/api/src/sdk "$tmp_sdk" 2>&1); then
    echo "✓ SDK 生成物与 api-docs.json 同步"
else
    echo "✖ packages/api/src/sdk 与 openapi/api-docs.json 不同步（前 20 行差异）"
    printf '%s\n' "$diff_out" | head -20
    echo "  → 跑 pnpm --filter @shop/api exec openapi-ts 重新生成后连同本次改动一起提交，再推送"
    fail=1
fi

# ---- 2) 提交的 api-docs.json vs 运行中的后端（在线，可选）----
if curl -sf -m 2 http://localhost:8080/v3/api-docs -o /tmp/shop-api-docs-live.json 2>/dev/null; then
    live=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('/tmp/shop-api-docs-live.json','utf8'))))")
    local_doc=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('openapi/api-docs.json','utf8'))))")
    if [ "$live" != "$local_doc" ]; then
        echo "✖ 运行中的后端契约与 openapi/api-docs.json 不一致 → 先 pnpm gen:sdk 更新并提交"
        fail=1
    else
        echo "✓ api-docs.json 与运行中的后端一致"
    fi
else
    echo "○ 后端未启动（localhost:8080），跳过在线契约比对"
fi

exit $fail
