import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { chromium } from 'playwright'

const distRoot = resolve('dist')
const mountPath = '/games/neon-breaker/'
const failures = []
const checks = []

const check = (condition, name, evidence) => {
  const passed = Boolean(condition)
  checks.push({ name, passed, evidence })
  if (!passed) failures.push(name)
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

if (!existsSync(join(distRoot, 'index.html'))) {
  console.error('dist/index.html 不存在，请先执行 pnpm build')
  process.exit(1)
}

const indexHtml = readFileSync(join(distRoot, 'index.html'), 'utf8')
const localReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => !/^(?:data:|https?:|#)/.test(value))

check(localReferences.length >= 4, '生产入口引用完整', localReferences.join(', '))
check(localReferences.every((value) => value.startsWith('./')), '生产资源使用相对路径', localReferences.join(', '))
check(localReferences.every((value) => existsSync(join(distRoot, value.slice(2)))), '生产入口资源全部存在', `${localReferences.length}/${localReferences.length}`)

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (!requestUrl.pathname.startsWith(mountPath)) {
    response.writeHead(404).end('Not found')
    return
  }

  const relativeUrl = decodeURIComponent(requestUrl.pathname.slice(mountPath.length)) || 'index.html'
  const candidate = resolve(distRoot, normalize(relativeUrl))
  if (relative(distRoot, candidate).startsWith('..') || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404).end('Not found')
    return
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(candidate)] ?? 'application/octet-stream' })
  response.end(readFileSync(candidate))
})

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
const baseUrl = `http://127.0.0.1:${address.port}${mountPath}`
let browser

try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const runtimeErrors = []
  const responses = []

  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) runtimeErrors.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => runtimeErrors.push(`requestfailed: ${request.url()}`))
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }))

  const mainResponse = await page.goto(baseUrl, { waitUntil: 'networkidle' })
  check(mainResponse?.status() === 200, '嵌套子目录入口可访问', `${mainResponse?.status()} ${baseUrl}`)

  const titleMetrics = await page.evaluate(() => ({
    title: document.title,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    brandIconWidth: document.querySelector('.brand-mark')?.naturalWidth ?? 0,
    manifest: document.querySelector('link[rel="manifest"]')?.href ?? '',
  }))
  check(titleMetrics.title === '霓虹破界：Neon Breaker', '生产标题正确', titleMetrics.title)
  check(!titleMetrics.overflowX, '390px 标题页无横向溢出', JSON.stringify(titleMetrics))
  check(titleMetrics.brandIconWidth > 0, '生产品牌图标加载', `${titleMetrics.brandIconWidth}px`)
  check(titleMetrics.manifest.startsWith(baseUrl), 'Manifest 保持嵌套路径', titleMetrics.manifest)

  await page.getByRole('button', { name: '设置', exact: true }).click()
  const inspectSettings = async (width, height) => {
    await page.setViewportSize({ width, height })
    return page.evaluate(() => {
      const cards = [...document.querySelectorAll('.quality-options button')]
      return {
        width: innerWidth,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cardCount: cards.length,
        cardBounds: cards.map((card) => {
          const rect = card.getBoundingClientRect()
          return { left: Number(rect.left.toFixed(2)), right: Number(rect.right.toFixed(2)), width: Number(rect.width.toFixed(2)) }
        }),
      }
    })
  }

  const settings390 = await inspectSettings(390, 844)
  const settings320 = await inspectSettings(320, 996)
  const cardsFit = (metrics) => metrics.cardCount === 4
    && !metrics.overflowX
    && metrics.cardBounds.every((card) => card.left >= 0 && card.right <= metrics.width && card.width > 0)
  check(cardsFit(settings390), '390px 设置四卡片完整', JSON.stringify(settings390))
  check(cardsFit(settings320), '320px 设置四卡片完整', JSON.stringify(settings320))

  await page.getByRole('button', { name: '战役', exact: true }).click()
  const inspectCampaignStarSpacing = async (width, height) => {
    await page.setViewportSize({ width, height })
    return page.evaluate(() => {
      const stars = document.querySelector('.detail-stars')
      const deploy = document.querySelector('.deploy-button')
      const starsRect = stars?.getBoundingClientRect()
      const deployRect = deploy?.getBoundingClientRect()
      const starsStyle = stars ? getComputedStyle(stars) : null
      return {
        width: innerWidth,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        gap: starsRect && deployRect ? Number((deployRect.top - starsRect.bottom).toFixed(2)) : null,
        borderStyle: starsStyle?.borderStyle ?? null,
        backgroundColor: starsStyle?.backgroundColor ?? null,
      }
    })
  }

  const campaign390 = await inspectCampaignStarSpacing(390, 844)
  const campaignDesktop = await inspectCampaignStarSpacing(1124, 859)
  const isPlainStarRow = (metrics) => metrics.borderStyle === 'none'
    && metrics.backgroundColor === 'rgba(0, 0, 0, 0)'
    && !metrics.overflowX
    && !metrics.overflowY
  check(isPlainStarRow(campaign390) && campaign390.gap === 8, '390px 章节星级为简洁文字行且间距稳定', JSON.stringify(campaign390))
  check(isPlainStarRow(campaignDesktop) && campaignDesktop.gap === 12, '桌面章节星级为简洁文字行且间距稳定', JSON.stringify(campaignDesktop))

  const failedResponses = responses.filter((response) => response.status >= 400)
  check(failedResponses.length === 0, '生产资源请求无失败', JSON.stringify(failedResponses))
  check(runtimeErrors.length === 0, '生产页面无控制台或运行错误', JSON.stringify(runtimeErrors))
} catch (error) {
  failures.push('生产浏览器门禁执行')
  checks.push({ name: '生产浏览器门禁执行', passed: false, evidence: error.stack ?? String(error) })
} finally {
  await browser?.close()
  await new Promise((resolveClose) => server.close(resolveClose))
}

console.log(JSON.stringify({
  release: '霓虹破界：Neon Breaker v1.0.2 production bundle',
  summary: { passed: checks.filter((item) => item.passed).length, total: checks.length, failures },
  checks,
}, null, 2))

if (failures.length) process.exitCode = 1
