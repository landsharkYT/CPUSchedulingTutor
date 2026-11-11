import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const url = 'http://127.0.0.1:4174/'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'pipe' })
let browser

async function ready() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* Vite is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('The preview server did not start.')
}

try {
  assert.ok(existsSync(chromium.executablePath()), 'Install the Playwright Chromium browser before running test:browser.')
  await ready()
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => { errors.push(`Unexpected browser dialog: ${dialog.type()}`); void dialog.dismiss() })
  await page.goto(url)
  await page.getByRole('heading', { name: 'Think like the scheduler.' }).waitFor()
  assert.ok(await page.getByRole('button', { name: 'Open settings' }).isVisible())
  await page.locator('[data-cell="0"]').click()
  assert.match(await page.locator('[data-cell="0"]').getAttribute('aria-label'), /P1/)
  await page.locator('[data-cell="0"]').focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('[data-cell="1"]').evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('2')
  assert.match(await page.locator('[data-cell="1"]').getAttribute('aria-label'), /P2/)
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('switch').click()
  assert.ok(await page.getByRole('alertdialog').isVisible())
  await page.getByRole('button', { name: 'Keep current set' }).click()
  assert.ok(await page.getByRole('dialog', { name: 'Settings' }).isVisible())
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'Discard and continue' }).click()
  assert.ok(await page.getByRole('dialog', { name: 'Settings' }).isVisible())
  assert.ok(await page.getByRole('columnheader', { name: 'Priority' }).isVisible())
  assert.ok(await page.getByRole('button', { name: 'Priority · preemptive' }).isVisible())
  await page.getByRole('radio', { name: 'Dark' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await page.getByRole('radio', { name: 'Priority first' }).click()
  assert.equal(await page.getByRole('radio', { name: 'Priority first' }).getAttribute('aria-checked'), 'true')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'P3' }).dragTo(page.locator('[data-cell="2"]'))
  assert.match(await page.locator('[data-cell="2"]').getAttribute('aria-label'), /P3/)
  await page.screenshot({ path: '/tmp/cpu-scheduling-lab-desktop.png', fullPage: true })

  await page.reload()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('radio', { name: 'Light' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Move finish right' }).click()
  await page.getByRole('button', { name: 'Move finish right' }).click()
  await page.getByRole('button', { name: 'Move finish right' }).click()
  const alignment = await page.evaluate(() => {
    const first = document.querySelector('[data-cell="0"]')?.getBoundingClientRect()
    const fourth = document.querySelector('[data-cell="3"]')?.getBoundingClientRect()
    const marker = document.querySelector('.finish-marker')?.getBoundingClientRect()
    const scroll = document.querySelector('.timeline-scroll')
    const palette = document.querySelector('.palette')?.getBoundingClientRect()
    const processPanel = document.querySelector('.process-panel')?.getBoundingClientRect()
    const algorithmPanel = document.querySelector('.algorithm-panel')?.getBoundingClientRect()
    const rulesCard = document.querySelector('.rules-card')?.getBoundingClientRect()
    const finishTime = Number(document.querySelector('.finish-time')?.textContent?.slice(2))
    const finishCell = document.querySelector(`[data-cell="${finishTime}"]`)?.getBoundingClientRect()
    if (!first || !fourth || !marker || !finishCell || !scroll || !palette || !processPanel || !algorithmPanel || !rulesCard) throw new Error('Timeline elements are missing.')
    scroll.scrollLeft = scroll.scrollWidth
    const processTable = document.querySelector('.process-table')
    const metricsTable = document.querySelector('.metrics-table')
    return { cellWidth: fourth.left - first.left, markerLeft: marker.left, boundary: finishCell.left, scrollable: scroll.scrollWidth > scroll.clientWidth, paletteVisible: palette.width > 0, processWidth: processPanel.width, algorithmWidth: algorithmPanel.width, rulesWidth: rulesCard.width, pageOverflow: document.documentElement.scrollWidth - innerWidth, processOverflow: (processTable?.scrollWidth ?? 0) - processPanel.width, metricsOverflow: (metricsTable?.scrollWidth ?? 0) - (document.querySelector('.metrics-panel')?.clientWidth ?? 0) }
  })
  assert.equal(alignment.cellWidth, 132)
  assert.ok(Math.abs(alignment.markerLeft - alignment.boundary) <= 2, `Finish marker is misaligned: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.scrollable)
  assert.ok(alignment.pageOverflow <= 1, `Page overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.processOverflow <= 1, `Process table overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.metricsOverflow <= 1, `Metrics table overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.paletteVisible)
  assert.ok(Math.abs(alignment.processWidth - alignment.algorithmWidth) <= 2)
  assert.ok(Math.abs(alignment.processWidth - alignment.rulesWidth) <= 2)
  for (const width of [320, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - innerWidth,
      process: (document.querySelector('.process-table')?.scrollWidth ?? 0) - (document.querySelector('.process-panel')?.clientWidth ?? 0),
      metrics: (document.querySelector('.metrics-table')?.scrollWidth ?? 0) - (document.querySelector('.metrics-panel')?.clientWidth ?? 0),
    }))
    assert.ok(layout.page <= 1 && layout.process <= 1 && layout.metrics <= 1, `Layout overflows at ${width}px: ${JSON.stringify(layout)}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const touchPage = await touchContext.newPage()
  await touchPage.goto(url)
  await touchPage.getByRole('button', { name: 'P2' }).tap()
  await touchPage.locator('[data-cell="0"]').tap()
  assert.match(await touchPage.locator('[data-cell="0"]').getAttribute('aria-label'), /P2/)
  await touchPage.getByRole('button', { name: 'Show turnaround formula' }).first().tap()
  assert.equal(await touchPage.getByRole('button', { name: 'Show turnaround formula' }).first().getAttribute('aria-expanded'), 'true')
  await touchContext.close()
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '/tmp/cpu-scheduling-lab-mobile.png', fullPage: true })
  console.log('Browser smoke passed: drag, touch, keyboard, custom discard, saved theme, and mobile layout.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
