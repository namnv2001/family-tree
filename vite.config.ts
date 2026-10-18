import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const SAVABLE = /^(tree\.json|photos\/[\w-]+\.webp)$/

// Endpoint ghi dữ liệu chỉ có trên dev server — bản build tĩnh không ghi được gì.
function devSave(): Plugin {
  return {
    name: 'dev-save',
    configureServer(server) {
      server.middlewares.use('/__save', async (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        if (!SAVABLE.test(rel)) {
          res.statusCode = 400
          return res.end()
        }
        const file = resolve(server.config.publicDir, rel)
        try {
          if (req.method === 'DELETE') {
            await rm(file, { force: true })
          } else {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk)
            const body = Buffer.concat(chunks)
            if (rel === 'tree.json') JSON.parse(body.toString('utf8'))
            await mkdir(dirname(file), { recursive: true })
            await writeFile(file, body)
          }
          res.end()
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

export default defineConfig({
  // GitHub Pages phục vụ dưới /<repo>/ — base tương đối chạy được ở mọi path.
  base: './',
  plugins: [react(), tailwindcss(), devSave()],
  // Không cho Vite reload trang mỗi lần app tự ghi dữ liệu.
  server: { watch: { ignored: ['**/public/tree.json', '**/public/photos/**'] } },
})
