import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/** テストの中で作ったブラウザ環境。テストごとに自分で閉じる */
const contexts: BrowserContext[] = []

test.afterEach(async () => {
  for (const context of contexts.splice(0)) {
    const started = Date.now()
    await context.close()
    console.log(`[e2e] context closed in ${Date.now() - started}ms`)
  }
})

/** 別々のブラウザ環境(Cookie・localStorage が共有されない)を1人ずつ用意する */
async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  contexts.push(context)
  return context.newPage()
}

async function joinRoom(page: Page, name: string, room: string, via: 'form' | 'invite'): Promise<void> {
  await page.goto(via === 'invite' ? `/?room=${encodeURIComponent(room)}` : '/')
  await page.getByLabel('あなたの名前').fill(name)
  if (via === 'form') await page.getByLabel('部屋名').fill(room)
  else await expect(page.getByLabel('部屋名')).toHaveValue(room)
  await page.getByRole('button', { name: '部屋に入る' }).click()
  await expect(page.getByRole('heading', { name: `部屋「${room}」` })).toBeVisible()
}

test('2つのブラウザが同じ部屋に入り、最後まで遊んで、もう一度始められる', async ({ browser }) => {
  const room = `e2e-${Date.now()}`
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await joinRoom(alice, 'アリス', room, 'form')
  await joinRoom(bob, 'ボブ', room, 'invite')
  await expect(alice.getByRole('listitem').filter({ hasText: 'ボブ' })).toBeVisible()
  await expect(bob.getByText('部屋主が対戦を始めるのを待っています')).toBeVisible()

  await alice.getByRole('button', { name: /対戦をはじめる/ }).click()

  for (const page of [alice, bob]) await expect(page.getByRole('region', { name: '場' })).toBeVisible()
  await expect(alice.getByRole('article', { name: /ボブ/ })).toBeVisible()
  await expect(bob.getByRole('article', { name: /アリス/ })).toBeVisible()

  // 操作しなくても、時間切れと CPU で最後まで進み、両方に結果が出る
  for (const page of [alice, bob]) {
    await expect(page.getByRole('dialog', { name: /位 でした/ })).toBeVisible({ timeout: 120_000 })
  }
  // 部屋主でない人には「もう一度」ボタンが出ない
  await expect(bob.getByRole('dialog').getByRole('button', { name: '同じメンバーでもう一度' })).toHaveCount(0)

  await alice.getByRole('dialog').getByRole('button', { name: '同じメンバーでもう一度' }).click()
  for (const page of [alice, bob]) {
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('region', { name: '場' })).toBeVisible()
  }
})

test('対戦中にリロードしても、同じ部屋の同じ席に戻れる', async ({ browser }) => {
  const room = `e2e-reload-${Date.now()}`
  const alice = await newPlayer(browser)
  const bob = await newPlayer(browser)

  await joinRoom(alice, 'アリス', room, 'form')
  await joinRoom(bob, 'ボブ', room, 'form')
  await alice.getByRole('button', { name: /対戦をはじめる/ }).click()
  await expect(bob.getByRole('region', { name: '場' })).toBeVisible()

  await bob.reload()

  await expect(bob.getByRole('region', { name: '場' })).toBeVisible()
  await expect(bob.getByRole('article', { name: /アリス/ })).toBeVisible()
  await expect(bob.getByRole('group', { name: /あなたの手札/ })).toBeVisible()
  // アリスの画面でも、ボブは同じ席にいる
  await expect(alice.getByRole('article', { name: /ボブ/ })).toBeVisible()
})
