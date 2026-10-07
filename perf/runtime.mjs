import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// 自定义 audit/gatherer 必须与 LHCI 自带引擎同版，不额外装另一份 Lighthouse。
const require = createRequire(import.meta.url)
const lhciRequire = createRequire(require.resolve("@lhci/cli/package.json"))
export const lighthousePath = (file) =>
    pathToFileURL(resolve(dirname(lhciRequire.resolve("lighthouse/package.json")), file)).href
