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
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('switch').click()
  assert.ok(await page.getByRole('columnheader', { name: 'Priority' }).isVisible())
  assert.ok(await page.getByRole('button', { name: 'Priority · preemptive' }).isVisible())
  await page.getByRole('radio', { name: 'Priority first' }).click()
  assert.equal(await page.getByRole('radio', { name: 'Priority first' }).getAttribute('aria-checked'), 'true')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.screenshot({ path: '/tmp/cpu-scheduling-lab-desktop.png', fullPage: true })

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
    if (!first || !fourth || !marker || !scroll || !palette || !processPanel || !algorithmPanel || !rulesCard) throw new Error('Timeline elements are missing.')
    scroll.scrollLeft = scroll.scrollWidth
    return { cellWidth: fourth.left - first.left, markerCenter: marker.left + marker.width / 2, boundary: fourth.left, scrollable: scroll.scrollWidth > scroll.clientWidth, paletteVisible: palette.width > 0, processWidth: processPanel.width, algorithmWidth: algorithmPanel.width, rulesWidth: rulesCard.width }
  })
  assert.equal(alignment.cellWidth, 132)
  assert.ok(Math.abs(alignment.markerCenter - alignment.boundary) <= 2, `Finish marker is misaligned: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.scrollable)
  assert.ok(alignment.paletteVisible)
  assert.ok(Math.abs(alignment.processWidth - alignment.algorithmWidth) <= 2)
  assert.ok(Math.abs(alignment.processWidth - alignment.rulesWidth) <= 2)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '/tmp/cpu-scheduling-lab-mobile.png', fullPage: true })
  console.log('Browser smoke passed: desktop controls, priority settings, keyboard input, and mobile timeline.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
