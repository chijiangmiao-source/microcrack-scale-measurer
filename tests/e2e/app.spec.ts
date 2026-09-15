import { expect, test, type Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';

const fixtures = ensureFixtures();

/** 完整走一遍小图标定 + 测量，便于各用例复用。 */
async function calibrateAndMeasure(page: Page): Promise<void> {
  const overlay = page.getByTestId('overlay-canvas');
  await page.getByTestId('file-input').setInputFiles(fixtures.small);
  await expect(overlay).toBeVisible();
  await overlay.click({ position: { x: 50, y: 50 } });
  await overlay.click({ position: { x: 250, y: 50 } });
  await page.getByTestId('length-input').fill('10');
  await page.getByTestId('confirm-length').click();
  await overlay.click({ position: { x: 10, y: 200 } });
  await overlay.click({ position: { x: 110, y: 200 } });
  await expect(page.getByTestId('result-value')).toHaveText('5.000 mm');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('上传有效图片并完成标定与测量，结果唯一且为毫米', async ({ page }) => {
  // 不调用任何在线服务：只允许本页源与 blob/data
  const externalRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      !url.startsWith(`${new URL(page.url()).origin}/`) &&
      !url.startsWith('blob:') &&
      !url.startsWith('data:')
    ) {
      externalRequests.push(url);
    }
  });

  await expect(page.getByTestId('placeholder')).toBeVisible();
  await expect(page.getByTestId('stage-prompt')).toContainText('请先导入显微照片');

  await page.getByTestId('file-input').setInputFiles(fixtures.small);

  const overlay = page.getByTestId('overlay-canvas');
  await expect(overlay).toBeVisible();
  // 画布按自然像素尺寸设置，不经 CSS 缩放
  await expect(overlay).toHaveAttribute('width', '400');
  await expect(overlay).toHaveAttribute('height', '300');
  const box = await overlay.boundingBox();
  expect(box?.width).toBe(400);
  expect(box?.height).toBe(300);

  await expect(page.getByTestId('stage-prompt')).toContainText('点取标尺起点');
  await overlay.click({ position: { x: 50, y: 50 } });
  await expect(page.getByTestId('stage-prompt')).toContainText('点取标尺终点');
  await overlay.click({ position: { x: 250, y: 50 } });
  await expect(page.getByTestId('stage-prompt')).toContainText('输入标尺实际长度');

  await page.getByTestId('length-input').fill('10');
  await page.getByTestId('confirm-length').click();
  await expect(page.getByTestId('stage-prompt')).toContainText('点取裂纹起点');
  await expect(page.getByTestId('ratio-value')).toContainText('0.05 mm/px');

  await overlay.click({ position: { x: 10, y: 200 } });
  await expect(page.getByTestId('stage-prompt')).toContainText('点取裂纹终点');
  await overlay.click({ position: { x: 110, y: 200 } });

  await expect(page.getByTestId('stage-prompt')).toContainText('测量完成');
  // 成功后只显示当前标尺比例与唯一毫米结果
  await expect(page.getByTestId('result-value')).toHaveText('5.000 mm');
  await expect(page.getByTestId('result-value')).toHaveCount(1);
  await expect(page.getByTestId('ratio-value')).toHaveCount(1);
  await expect(page.getByTestId('length-form')).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test('小视口滚动容器内点选仍对应自然像素，画布不被缩放', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(fixtures.large);
  const overlay = page.getByTestId('overlay-canvas');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('width', '2200');
  await expect(overlay).toHaveAttribute('height', '1600');

  // 画布 CSS 尺寸等于自然尺寸（无缩放）
  const box0 = await overlay.boundingBox();
  expect(box0?.width).toBe(2200);
  expect(box0?.height).toBe(1600);

  const scroller = page.getByTestId('canvas-scroll');
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(0);

  // 先滚动容器，再按客户端坐标点选远处像素
  await scroller.evaluate((el) => {
    el.scrollLeft = 1500;
    el.scrollTop = 1100;
  });

  let box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + 1800, box.y + 1200);
  await page.mouse.click(box.x + 2100, box.y + 1200); // 标尺 300 px
  await expect(page.getByTestId('stage-prompt')).toContainText('输入标尺实际长度');

  await page.getByTestId('length-input').fill('30'); // 30 mm / 300 px = 0.1 mm/px
  await page.getByTestId('confirm-length').click();
  await expect(page.getByTestId('ratio-value')).toContainText('0.1 mm/px');

  box = (await overlay.boundingBox())!;
  await page.mouse.click(box.x + 1900, box.y + 1400);
  await page.mouse.click(box.x + 1900, box.y + 1500); // 裂纹 100 px → 10 mm

  await expect(page.getByTestId('result-value')).toHaveText('10.000 mm');
  // 容器确实发生了滚动（视口装不下自然尺寸）
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('换入新的有效图片才清空旧状态', async ({ page }) => {
  await calibrateAndMeasure(page);
  await expect(page.getByTestId('result-value')).toHaveText('5.000 mm');

  await page.getByTestId('file-input').setInputFiles(fixtures.other);

  const overlay = page.getByTestId('overlay-canvas');
  await expect(overlay).toHaveAttribute('width', '500');
  await expect(overlay).toHaveAttribute('height', '400');
  // 旧结果与标定被清空，回到标定阶段
  await expect(page.getByTestId('result-panel')).toHaveCount(0);
  await expect(page.getByTestId('stage-prompt')).toContainText('点取标尺起点');
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

test('首次导入无效文件：不显示图片并给出反馈', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(fixtures.notImage);
  await expect(page.getByTestId('error-message')).toContainText('仅支持 PNG 或 JPEG');
  await expect(page.getByTestId('placeholder')).toBeVisible();
  await expect(page.getByTestId('overlay-canvas')).toHaveCount(0);

  await page.getByTestId('file-input').setInputFiles(fixtures.corrupt);
  await expect(page.getByTestId('error-message')).toContainText('已损坏或无法解码');
  await expect(page.getByTestId('placeholder')).toBeVisible();

  await page.getByTestId('file-input').setInputFiles(fixtures.oversized);
  await expect(page.getByTestId('error-message')).toContainText('超过 10 MiB');
  await expect(page.getByTestId('placeholder')).toBeVisible();
});

test('已有图片与结果后再选无效文件：保留当前图片、标定和结果', async ({ page }) => {
  await calibrateAndMeasure(page);

  for (const [file, message] of [
    [fixtures.corrupt, '已损坏或无法解码'],
    [fixtures.oversized, '超过 10 MiB'],
    [fixtures.notImage, '仅支持 PNG 或 JPEG'],
  ] as const) {
    await page.getByTestId('file-input').setInputFiles(file);
    await expect(page.getByTestId('error-message')).toContainText(message);
    // 图片、标定比例与测量结果全部保留
    await expect(page.getByTestId('overlay-canvas')).toHaveAttribute('width', '400');
    await expect(page.getByTestId('ratio-value')).toContainText('0.05 mm/px');
    await expect(page.getByTestId('result-value')).toHaveText('5.000 mm');
    await expect(page.getByTestId('stage-prompt')).toContainText('测量完成');
  }
});

test('标尺两点重合：停留在标定阶段', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(fixtures.small);
  const overlay = page.getByTestId('overlay-canvas');
  await expect(overlay).toBeVisible();

  await overlay.click({ position: { x: 100, y: 100 } });
  await overlay.click({ position: { x: 100, y: 100 } });

  await expect(page.getByTestId('error-message')).toContainText('标尺两端点重合');
  await expect(page.getByTestId('stage-prompt')).toContainText('标定阶段');
  await expect(page.getByTestId('length-form')).toHaveCount(0);

  // 重新正确点取后可以继续
  await overlay.click({ position: { x: 50, y: 50 } });
  await overlay.click({ position: { x: 250, y: 50 } });
  await expect(page.getByTestId('length-form')).toBeVisible();
});

test('标尺长度越界：停留在标定阶段，改正后可继续', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(fixtures.small);
  const overlay = page.getByTestId('overlay-canvas');
  await expect(overlay).toBeVisible();
  await overlay.click({ position: { x: 50, y: 50 } });
  await overlay.click({ position: { x: 250, y: 50 } });

  for (const bad of ['0.001', '200', '0']) {
    await page.getByTestId('length-input').fill(bad);
    await page.getByTestId('confirm-length').click();
    await expect(page.getByTestId('error-message')).toContainText('0.01 至 100');
    await expect(page.getByTestId('stage-prompt')).toContainText('标定阶段');
    // 标尺点保留，长度表单仍在
    await expect(page.getByTestId('length-form')).toBeVisible();
  }

  await page.getByTestId('length-input').fill('10');
  await page.getByTestId('confirm-length').click();
  await expect(page.getByTestId('stage-prompt')).toContainText('点取裂纹起点');
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});
