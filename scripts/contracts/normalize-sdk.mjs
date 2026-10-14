import { readdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const output = process.argv[2]
if (!output) throw new Error("SDK output directory is required")
const entries = await readdir(resolve(output), { recursive: true, withFileTypes: true })
await Promise.all(
    entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
        .map(async (entry) => {
            const file = join(entry.parentPath, entry.name)
            const text = await readFile(file, "utf8")
            const normalized = text.replaceAll(/^[\t ]+(?=\r?$)/gm, "")
            if (normalized !== text) await writeFile(file, normalized, "utf8")
        }),
)
