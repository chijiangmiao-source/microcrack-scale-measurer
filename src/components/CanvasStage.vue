<script setup lang="ts">
/**
 * 画布台：图片按自然像素尺寸绘制到底层画布，叠加层画布承载点位/线段。
 * 不使用任何 CSS 缩放或画布变换，小视口由外层滚动容器承载，
 * 因此点击坐标 1:1 对应图片自然像素。
 */
import { ref, watchPostEffect } from 'vue';
import type { Point } from '../lib/geometry';
import type { CrackRecord, Stage } from '../lib/session';
import { drawOverlay } from '../lib/overlay';

const props = defineProps<{
  image: HTMLImageElement;
  stage: Stage;
  scalePoints: readonly Point[];
  crackPoints: readonly Point[];
  records: readonly CrackRecord[];
}>();

const emit = defineEmits<{
  pick: [point: Point];
}>();

const baseCanvas = ref<HTMLCanvasElement | null>(null);
const overlayCanvas = ref<HTMLCanvasElement | null>(null);
const hover = ref<Point | null>(null);

/** 事件坐标 → 自然像素坐标（画布无缩放，直接取整到像素网格）。 */
function toNaturalPixel(e: MouseEvent): Point {
  const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
  return {
    x: Math.round(e.clientX - rect.left),
    y: Math.round(e.clientY - rect.top),
  };
}

function onClick(e: MouseEvent): void {
  emit('pick', toNaturalPixel(e));
}

function onMove(e: MouseEvent): void {
  hover.value = toNaturalPixel(e);
}

// 图片更换后按自然尺寸重绘底层（设置 width/height 属性即画布像素尺寸，非 CSS 缩放）
watchPostEffect(() => {
  const canvas = baseCanvas.value;
  const img = props.image;
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
});

// 状态或悬停变化时重绘叠加层
watchPostEffect(() => {
  const canvas = overlayCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawOverlay(ctx, {
    stage: props.stage,
    scalePoints: props.scalePoints,
    crackPoints: props.crackPoints,
    records: props.records,
    hover: hover.value,
  });
});
</script>

<template>
  <div class="canvas-scroll" data-testid="canvas-scroll">
    <div
      class="canvas-stack"
      :style="{ width: `${image.naturalWidth}px`, height: `${image.naturalHeight}px` }"
    >
      <canvas
        ref="baseCanvas"
        class="stage-canvas stage-canvas--base"
        :width="image.naturalWidth"
        :height="image.naturalHeight"
        data-testid="base-canvas"
      ></canvas>
      <canvas
        ref="overlayCanvas"
        class="stage-canvas stage-canvas--overlay"
        :width="image.naturalWidth"
        :height="image.naturalHeight"
        data-testid="overlay-canvas"
        @click="onClick"
        @mousemove="onMove"
        @mouseleave="hover = null"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.canvas-scroll {
  overflow: auto;
  max-width: 100%;
  max-height: 72vh;
  background: #0b1220;
  border: 1px solid #334155;
  border-radius: 8px;
}

.canvas-stack {
  position: relative;
}

/* 画布仅按 width/height 属性确定像素尺寸，不做任何 CSS 缩放 */
.stage-canvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
}

.stage-canvas--overlay {
  cursor: crosshair;
}
</style>
