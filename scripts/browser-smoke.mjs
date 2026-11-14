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
  await page.locator('.metrics-table thead th:last-child .formula-trigger').click()
  const responseFormulaBounds = await page.evaluate(() => {
    const tooltip = document.querySelector('.metrics-table thead th:last-child .formula-popover')?.getBoundingClientRect()
    const panel = document.querySelector('.metrics-panel')?.getBoundingClientRect()
    if (!tooltip || !panel) throw new Error('Response formula tooltip is missing.')
    return { tooltipLeft: tooltip.left, tooltipRight: tooltip.right, panelLeft: panel.left, panelRight: panel.right }
  })
  assert.ok(responseFormulaBounds.tooltipRight <= responseFormulaBounds.panelRight - 8 && responseFormulaBounds.tooltipLeft >= responseFormulaBounds.panelLeft + 8, `Response formula is clipped: ${JSON.stringify(responseFormulaBounds)}`)
  const desktopFormulaButtons = page.locator('.metrics-panel .formula-trigger:visible')
  for (let index = 0; index < await desktopFormulaButtons.count(); index += 1) {
    await desktopFormulaButtons.nth(index).click()
    const bounds = await desktopFormulaButtons.nth(index).evaluate((button) => {
      const tooltip = button.parentElement?.querySelector('.formula-popover')?.getBoundingClientRect()
      const panel = button.closest('.metrics-panel')?.getBoundingClientRect()
      if (!tooltip || !panel) throw new Error('Formula tooltip is missing.')
      return { left: tooltip.left, right: tooltip.right, panelLeft: panel.left, panelRight: panel.right }
    })
    assert.ok(bounds.left >= bounds.panelLeft + 8 && bounds.right <= bounds.panelRight - 8, `Formula tooltip overflows the card: ${JSON.stringify(bounds)}`)
  }
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
    const precedingCell = document.querySelector(`[data-cell="${finishTime - 1}"]`)?.getBoundingClientRect()
    if (!first || !fourth || !marker || !precedingCell || !scroll || !palette || !processPanel || !algorithmPanel || !rulesCard) throw new Error('Timeline elements are missing.')
    const processTable = document.querySelector('.process-table')
    const metricsTable = document.querySelector('.metrics-table')
    return { cellWidth: (fourth.left - first.left) / 3, markerLeft: marker.left, boundary: precedingCell.right, timelineOverflow: scroll.scrollWidth - scroll.clientWidth, rowCount: scroll.querySelectorAll('.timeline-row').length, paletteVisible: palette.width > 0, processWidth: processPanel.width, algorithmWidth: algorithmPanel.width, rulesWidth: rulesCard.width, pageOverflow: document.documentElement.scrollWidth - innerWidth, processOverflow: (processTable?.scrollWidth ?? 0) - processPanel.width, metricsOverflow: (metricsTable?.scrollWidth ?? 0) - (document.querySelector('.metrics-panel')?.clientWidth ?? 0) }
  })
  assert.ok(alignment.cellWidth >= 44, `Timeline cells are too narrow: ${JSON.stringify(alignment)}`)
  assert.ok(Math.abs(alignment.markerLeft - alignment.boundary) <= 2, `Finish marker is misaligned: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.timelineOverflow <= 1 && alignment.rowCount >= 2, `Timeline did not wrap cleanly: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.pageOverflow <= 1, `Page overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.processOverflow <= 1, `Process table overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.metricsOverflow <= 1, `Metrics table overflows: ${JSON.stringify(alignment)}`)
  assert.ok(alignment.paletteVisible)
  assert.ok(Math.abs(alignment.processWidth - alignment.algorithmWidth) <= 2)
  assert.ok(Math.abs(alignment.processWidth - alignment.rulesWidth) <= 2)
  await page.locator('[data-cell="11"]').click()
  assert.ok(await page.locator('[data-cell="12"]').isVisible())
  await page.locator('.timeline-row').first().locator('.time-boundary.end').click()
  const rowBoundary = await page.evaluate(() => {
    const firstRow = document.querySelector('.timeline-row')?.getBoundingClientRect()
    const marker = document.querySelector('.timeline-row .finish-marker')?.getBoundingClientRect()
    const label = document.querySelector('.timeline-row .finish-label')?.getBoundingClientRect()
    if (!firstRow || !marker || !label) throw new Error('Wrapped Finish marker is missing.')
    return { marker: marker.left, end: firstRow.right, labelLeft: label.left, labelRight: label.right }
  })
  assert.ok(Math.abs(rowBoundary.marker - rowBoundary.end) <= 2 && rowBoundary.labelLeft >= 0 && rowBoundary.labelRight <= 390, `Finish at a row break is clipped: ${JSON.stringify(rowBoundary)}`)
  const lastAllocatedCell = await page.locator('.timeline-scroll .time-cell').last().getAttribute('data-cell')
  await page.locator(`[data-cell="${lastAllocatedCell}"]`).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator(`[data-cell="${Number(lastAllocatedCell) + 1}"]`).evaluate((element) => element === document.activeElement), true)
  for (const width of [320, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    const layout = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - innerWidth,
      process: (document.querySelector('.process-table')?.scrollWidth ?? 0) - (document.querySelector('.process-panel')?.clientWidth ?? 0),
      metrics: (document.querySelector('.metrics-table')?.scrollWidth ?? 0) - (document.querySelector('.metrics-panel')?.clientWidth ?? 0),
      timeline: (document.querySelector('.timeline-scroll')?.scrollWidth ?? 0) - (document.querySelector('.timeline-scroll')?.clientWidth ?? 0),
    }))
    assert.ok(layout.page <= 1 && layout.process <= 1 && layout.metrics <= 1 && layout.timeline <= 1, `Layout overflows at ${width}px: ${JSON.stringify(layout)}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await page.getByRole('button', { name: /View worked solution/ }).click()
  const workedOverflow = await page.locator('.solution-chart').evaluate((element) => element.scrollWidth - element.clientWidth)
  assert.ok(workedOverflow <= 1, `Worked solution still scrolls horizontally: ${workedOverflow}`)
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const touchPage = await touchContext.newPage()
  await touchPage.goto(url)
  await touchPage.getByRole('button', { name: 'P2' }).tap()
  await touchPage.locator('[data-cell="0"]').tap()
  assert.match(await touchPage.locator('[data-cell="0"]').getAttribute('aria-label'), /P2/)
  await touchPage.getByRole('button', { name: 'Show turnaround formula' }).first().tap()
  assert.equal(await touchPage.getByRole('button', { name: 'Show turnaround formula' }).first().getAttribute('aria-expanded'), 'true')
  const mobileResponseButton = touchPage.locator('.metrics-table tbody tr:first-child td:last-child .formula-trigger')
  await mobileResponseButton.tap()
  const mobileFormulaBounds = await mobileResponseButton.evaluate((button) => {
    const tooltip = button.parentElement?.querySelector('.formula-popover')?.getBoundingClientRect()
    const panel = button.closest('.metrics-panel')?.getBoundingClientRect()
    if (!tooltip || !panel) throw new Error('Mobile formula tooltip is missing.')
    return { left: tooltip.left, right: tooltip.right, panelLeft: panel.left, panelRight: panel.right }
  })
  assert.ok(mobileFormulaBounds.left >= mobileFormulaBounds.panelLeft + 8 && mobileFormulaBounds.right <= mobileFormulaBounds.panelRight - 8, `Mobile formula tooltip overflows the card: ${JSON.stringify(mobileFormulaBounds)}`)
  await touchPage.setViewportSize({ width: 320, height: 844 })
  const narrowFormulaBounds = await mobileResponseButton.evaluate((button) => {
    const tooltip = button.parentElement?.querySelector('.formula-popover')?.getBoundingClientRect()
    const panel = button.closest('.metrics-panel')?.getBoundingClientRect()
    if (!tooltip || !panel) throw new Error('Narrow mobile formula tooltip is missing.')
    return { left: tooltip.left, right: tooltip.right, panelLeft: panel.left, panelRight: panel.right }
  })
  assert.ok(narrowFormulaBounds.left >= narrowFormulaBounds.panelLeft + 8 && narrowFormulaBounds.right <= narrowFormulaBounds.panelRight - 8, `Narrow mobile formula tooltip overflows the card: ${JSON.stringify(narrowFormulaBounds)}`)
  await touchContext.close()
  const mlfqPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  mlfqPage.on('pageerror', (error) => errors.push(error.message))
  await mlfqPage.goto(url)
  await mlfqPage.getByRole('button', { name: 'Multilevel feedback queue' }).click()
  assert.ok(await mlfqPage.getByRole('dialog', { name: /Who runs next/ }).isVisible())
  await mlfqPage.getByRole('button', { name: 'P1', exact: true }).last().click()
  assert.ok(await mlfqPage.getByText('Correct.').isVisible())
  await mlfqPage.getByRole('button', { name: 'Skip' }).click()
  assert.ok(await mlfqPage.getByRole('heading', { name: 'Track the queues' }).isVisible())
  await mlfqPage.getByRole('button', { name: 'Add event row' }).click()
  await mlfqPage.getByRole('textbox', { name: 'Event 1 time' }).fill('0')
  await mlfqPage.getByRole('button', { name: 'Arrival', exact: true }).click()
  await mlfqPage.getByRole('button', { name: 'Dispatch', exact: true }).click()
  await mlfqPage.getByRole('button', { name: /Event 1 CPU empty/ }).click()
  assert.ok(await mlfqPage.getByRole('button', { name: /Event 1 CPU P1/ }).isVisible())
  await mlfqPage.getByRole('button', { name: 'Open settings' }).click()
  assert.ok(await mlfqPage.getByText('Numeric process priorities are unavailable in MLFQ.').isVisible())
  await mlfqPage.getByRole('button', { name: 'Done' }).click()
  await mlfqPage.screenshot({ path: '/tmp/cpu-scheduling-mlfq-desktop.png', fullPage: true })
  await mlfqPage.setViewportSize({ width: 390, height: 844 })
  const mlfqOverflow = await mlfqPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert.ok(mlfqOverflow <= 1, `MLFQ page overflows at phone width: ${mlfqOverflow}`)
  await mlfqPage.screenshot({ path: '/tmp/cpu-scheduling-mlfq-mobile.png', fullPage: true })
  await mlfqPage.getByRole('button', { name: 'Standard algorithms' }).click()
  await mlfqPage.getByRole('button', { name: 'Multilevel feedback queue' }).click()
  assert.equal(await mlfqPage.getByRole('textbox', { name: 'Event 1 time' }).inputValue(), '0')
  await mlfqPage.evaluate(() => {
    const key = 'cpu-scheduling-lab-mlfq-v1'
    const session = JSON.parse(localStorage.getItem(key))
    session.problem.quantums = [2, 4, 6, 8]
    session.problem.processes[0].burst = 25
    session.attempt = { cells: Array(12).fill(null), finish: 0, rows: [], answers: {}, hasChecked: false, checked: false, solutionViewed: false, elapsedSeconds: 0, started: false, complete: false }
    localStorage.setItem(key, JSON.stringify(session))
  })
  await mlfqPage.reload()
  assert.ok(await mlfqPage.getByText('Q4', { exact: true }).isVisible())
  await mlfqPage.getByRole('button', { name: 'Add event row' }).click()
  assert.ok(await mlfqPage.getByRole('button', { name: 'Add selected process to event 1 Q4' }).isVisible())
  const fiveQueueOverflow = await mlfqPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert.ok(fiveQueueOverflow <= 1, `Five-queue MLFQ page overflows at phone width: ${fiveQueueOverflow}`)
  await mlfqPage.getByRole('button', { name: 'Check my work' }).click()
  await mlfqPage.getByRole('button', { name: /View worked solution/ }).click()
  const mlfqWorkedOverflow = await mlfqPage.locator('.solution-chart').evaluate((element) => element.scrollWidth - element.clientWidth)
  assert.ok(mlfqWorkedOverflow <= 1, `MLFQ worked solution still scrolls horizontally: ${mlfqWorkedOverflow}`)
  await mlfqPage.close()
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '/tmp/cpu-scheduling-lab-mobile.png', fullPage: true })
  console.log('Browser smoke passed: drag, touch, keyboard, custom discard, saved theme, and mobile layout.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
