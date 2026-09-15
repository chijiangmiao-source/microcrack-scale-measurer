# 显微裂纹标尺换算台

材料实验室显微检验员使用的纯前端工具：在显微照片上标定标尺、点取裂纹两端，自动换算裂纹实际长度（毫米）。全部计算在本地浏览器内完成，不调用任何在线服务。

## 功能与规则

- **文件校验**：仅接受不超过 10 MiB 且可真实解码的 PNG / JPEG（按魔数嗅探 + 浏览器解码验证）。
- **自然像素绘制**：图片按自然像素尺寸绘制到 Canvas，小视口由滚动容器承载；不使用 CSS 或画布变换缩放，点击坐标 1:1 对应自然像素。
- **测量流程**（阶段提示引导）：
  1. 标定阶段：依次点取标尺两端 → 输入标尺实际长度（0.01 – 100 mm）；
  2. 测量阶段：依次点取裂纹两端；
  3. 完成：仅显示当前标尺比例、测量线与唯一毫米结果。
- **换算公式**：
  - 比例 = 标尺实际长度 ÷ 标尺两点欧氏像素距离（mm/px）；
  - 裂纹长度 = 裂纹欧氏像素距离 × 比例；
  - 结果按十进制四舍五入保留 3 位小数，恰逢半个最小单位时向绝对值增大方向舍入。
- **约束**：标尺两点重合或长度越界时停留在标定阶段；首次导入无效文件不显示图片；已有图片 / 结果后再选无效文件（格式不符、超限、损坏）保留当前图片、标定与结果；只有换入新的有效图片才清空旧状态。

## 技术栈

TypeScript · Vue 3 · Vite · HTML Canvas · Vitest · Playwright · Docker Compose

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建
npm run test:unit  # Vitest：距离 / 比例 / 舍入边界 / 状态机 / 文件校验
npm run test:e2e   # Playwright：上传 / 滚动点选 / 换图 / 失败反馈（自动构建并起 preview）
npm run verify     # 单元 + 端到端一次跑完
```

## Docker Compose

```bash
# 启动 Web 应用（默认宿主端口 8080，可用 WEB_PORT 覆盖）
docker compose up web
WEB_PORT=9000 docker compose up web

# 一次性验收服务：构建镜像、启动 web、跑完 Vitest + Playwright 后退出
docker compose run --rm verify
```

- `web` 服务：多阶段构建，nginx 托管 `dist` 静态文件，容器内端口 80。
- `verify` 服务：基于官方 Playwright 镜像，先跑 Vitest，再以 `E2E_BASE_URL=http://web` 对 `web` 服务执行端到端测试；退出码即验收结果。

## 目录结构

```
src/
  lib/
    geometry.ts    # 欧氏距离、比例与裂纹长度换算
    rounding.ts    # 3 位小数舍入（恰半向绝对值增大方向）与展示格式
    validation.ts  # 10 MiB 上限、PNG/JPEG 魔数嗅探
    session.ts     # 测量会话状态机（标定 → 测量 → 完成）
    loadImage.ts   # 文件装载：体积 → 魔数 → 解码验证
    overlay.ts     # 点位 / 线段 / 十字线叠加绘制
  components/CanvasStage.vue  # 滚动容器 + 双层画布（自然像素，无缩放）
  App.vue                     # 流程编排、阶段提示、结果面板
tests/
  unit/   # Vitest
  e2e/    # Playwright（含本地 PNG 夹具生成器）
```
