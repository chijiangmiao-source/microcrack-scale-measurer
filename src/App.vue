<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue';
import CanvasStage from './components/CanvasStage.vue';
import { loadImageFile } from './lib/loadImage';
import { formatMm, formatRatio } from './lib/rounding';
import {
  MAX_SCALE_LENGTH_MM,
  MIN_SCALE_LENGTH_MM,
  MeasurementSession,
} from './lib/session';
import { MAX_FILE_BYTES } from './lib/validation';
import type { Point } from './lib/geometry';

const session = reactive(new MeasurementSession());

const image = shallowRef<HTMLImageElement | null>(null);
let currentObjectUrl: string | null = null;

const lengthInput = ref('');

const hasImage = computed(() => image.value !== null);

const stagePrompt = computed(() => {
  switch (session.stage) {
    case 'idle':
      return '请先导入显微照片（PNG / JPEG，不超过 10 MiB）';
    case 'calibrating':
      if (session.scalePoints.length === 0) return '标定阶段 · 第 1 步：点取标尺起点';
      if (session.scalePoints.length === 1) return '标定阶段 · 第 2 步：点取标尺终点';
      return `标定阶段 · 第 3 步：输入标尺实际长度（${MIN_SCALE_LENGTH_MM} – ${MAX_SCALE_LENGTH_MM} mm）并确认`;
    case 'measuring':
      return session.crackPoints.length === 0
        ? '测量阶段 · 第 1 步：点取裂纹起点'
        : '测量阶段 · 第 2 步：点取裂纹终点';
    case 'done':
      return '测量完成';
  }
});

const scaleDistanceText = computed(() =>
  session.scalePixelDistance === null ? '' : session.scalePixelDistance.toFixed(2),
);

const ratioText = computed(() =>
  session.ratioMmPerPx === null ? '' : formatRatio(session.ratioMmPerPx),
);

const resultText = computed(() =>
  session.resultMm === null ? '' : formatMm(session.resultMm),
);

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 允许再次选择同一文件时仍触发 change
  input.value = '';
  if (!file) return;

  const result = await loadImageFile(file);
  if (!result.ok) {
    // 无效文件：仅提示，保留当前图片、标定与结果
    session.reportFileError(result.message);
    return;
  }
  // 换入新的有效图片：清空旧状态
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = result.objectUrl;
  image.value = result.image;
  lengthInput.value = '';
  session.beginWithImage();
}

function onPick(point: Point): void {
  if (session.stage === 'calibrating') {
    session.addScalePoint(point);
  } else if (session.stage === 'measuring') {
    session.addCrackPoint(point);
  }
}

function confirmLength(): void {
  session.confirmScaleLength(Number(lengthInput.value));
}

function restartCalibration(): void {
  lengthInput.value = '';
  session.restartCalibration();
}

function restartMeasurement(): void {
  session.restartMeasurement();
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div>
        <h1>显微裂纹标尺换算台</h1>
        <p class="subtitle">材料实验室显微检验 · 纯前端本地计算，不调用在线服务</p>
      </div>
      <div class="actions">
        <label class="button button--primary">
          导入显微照片
          <input
            type="file"
            accept="image/png,image/jpeg"
            data-testid="file-input"
            hidden
            @change="onFileChange"
          />
        </label>
        <button
          v-if="hasImage"
          type="button"
          class="button"
          data-testid="restart-calibration"
          @click="restartCalibration"
        >
          重新标定
        </button>
        <button
          v-if="session.stage === 'measuring' || session.stage === 'done'"
          type="button"
          class="button"
          data-testid="restart-measurement"
          @click="restartMeasurement"
        >
          重新测量裂纹
        </button>
      </div>
    </header>

    <p class="stage-prompt" data-testid="stage-prompt">{{ stagePrompt }}</p>

    <p v-if="session.error" class="error-banner" data-testid="error-message" role="alert">
      <span>{{ session.error }}</span>
      <button type="button" class="error-close" aria-label="关闭提示" @click="session.clearError()">
        ×
      </button>
    </p>

    <main class="layout">
      <section class="stage-area">
        <CanvasStage
          v-if="image"
          :image="image"
          :stage="session.stage"
          :scale-points="session.scalePoints"
          :crack-points="session.crackPoints"
          @pick="onPick"
        />
        <div v-else class="placeholder" data-testid="placeholder">
          尚未导入图片。支持 PNG / JPEG，单张不超过 {{ MAX_FILE_BYTES / 1024 / 1024 }} MiB。
        </div>
      </section>

      <aside class="panel">
        <div
          v-if="session.stage === 'calibrating' && session.scalePoints.length === 2"
          class="panel-card"
          data-testid="length-form"
        >
          <label class="field">
            <span>标尺实际长度（mm）</span>
            <input
              v-model="lengthInput"
              type="number"
              :min="MIN_SCALE_LENGTH_MM"
              :max="MAX_SCALE_LENGTH_MM"
              step="any"
              data-testid="length-input"
              @keyup.enter="confirmLength"
            />
          </label>
          <p class="hint">标尺像素距离：{{ scaleDistanceText }} px</p>
          <button
            type="button"
            class="button button--primary"
            data-testid="confirm-length"
            @click="confirmLength"
          >
            确认标尺长度
          </button>
        </div>

        <div v-if="session.stage === 'measuring'" class="panel-card">
          <p class="panel-row">
            标尺比例：<span data-testid="ratio-value">{{ ratioText }}</span>
          </p>
        </div>

        <div v-if="session.stage === 'done'" class="panel-card" data-testid="result-panel">
          <p class="panel-row">
            标尺比例：<span data-testid="ratio-value">{{ ratioText }}</span>
          </p>
          <p class="panel-row panel-row--result">
            裂纹长度：<span data-testid="result-value">{{ resultText }}</span>
          </p>
        </div>
      </aside>
    </main>
  </div>
</template>
