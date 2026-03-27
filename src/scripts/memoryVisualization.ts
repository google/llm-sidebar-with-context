/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ContextRetrievalSnapshot,
  RetrievalSnapshotEpisode,
} from './types';

// --- Color palette matching sidebar.css design tokens ---
const COLORS = {
  bgDark: '#1e1e2e',
  bgMid: '#24253a',
  gridCell: '#2a2b42',
  gridCellHover: '#33345a',
  turnActive: '#7c5cfc',
  summaryActive: '#5b8def',
  turnGlow: 'rgba(124, 92, 252, 0.6)',
  summaryGlow: 'rgba(91, 141, 239, 0.6)',
  textMuted: '#8b90a0',
  textDim: '#5a5f72',
  textBright: '#cdd6f4',
  budgetArc: '#33345a',
  budgetFill: '#7c5cfc',
  budgetWarn: '#f5a623',
  budgetHigh: '#ef4444',
  keywordPill: 'rgba(124, 92, 252, 0.15)',
  keywordText: '#a78bfa',
  keywordMatchPill: 'rgba(124, 92, 252, 0.35)',
  keywordMatchText: '#c4b5fd',
  connectionLine: 'rgba(124, 92, 252, 0.2)',
};

interface BlockPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  episode: RetrievalSnapshotEpisode | null;
  isActive: boolean;
  glowIntensity: number;
  targetGlow: number;
}

/**
 * Renders a canvas-based memory block visualization.
 * Shows a grid of memory blocks where active (retrieved) blocks glow.
 * Includes a context budget arc gauge and keyword display.
 */
export class MemoryVisualization {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private blocks: BlockPosition[] = [];
  private animationFrame: number | null = null;
  private snapshot: ContextRetrievalSnapshot | null = null;
  private hoveredBlock: BlockPosition | null = null;
  private tooltipEl: HTMLDivElement;
  private dpr: number;

  constructor(private container: HTMLElement) {
    this.dpr = window.devicePixelRatio || 1;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'memory-viz-canvas';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'memory-viz-tooltip';
    this.tooltipEl.style.display = 'none';
    this.container.appendChild(this.tooltipEl);

    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
  }

  update(snapshot: ContextRetrievalSnapshot): void {
    this.snapshot = snapshot;
    this.buildBlocks();
    this.startAnimation();
  }

  destroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private buildBlocks(): void {
    if (!this.snapshot) return;

    const rect = this.container.getBoundingClientRect();
    const canvasW = rect.width;
    const canvasH = 140;

    this.canvas.style.width = `${canvasW}px`;
    this.canvas.style.height = `${canvasH}px`;
    this.canvas.width = canvasW * this.dpr;
    this.canvas.height = canvasH * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    const activeIds = new Set(
      this.snapshot.retrievedEpisodes.map((e) => e.id),
    );

    // Build block grid from total episode count
    const totalCount = Math.max(this.snapshot.totalEpisodeCount, 1);
    const cols = Math.min(totalCount, Math.floor((canvasW - 80) / 14));
    const rows = Math.ceil(totalCount / Math.max(cols, 1));
    const blockW = 10;
    const blockH = 10;
    const gap = 3;
    const gridW = cols * (blockW + gap) - gap;
    const offsetX = 8;
    const offsetY = Math.max(8, (canvasH - rows * (blockH + gap)) / 2);

    this.blocks = [];

    // Map retrieved episodes to block indices (spread across the grid)
    const retrievedIndices = new Set<number>();
    const episodeByIndex = new Map<number, RetrievalSnapshotEpisode>();
    const retrieved = this.snapshot.retrievedEpisodes;

    for (let i = 0; i < retrieved.length; i++) {
      // Spread active blocks across the grid for visual distribution
      const idx = Math.floor(
        (i / Math.max(retrieved.length - 1, 1)) * (totalCount - 1),
      );
      retrievedIndices.add(idx);
      episodeByIndex.set(idx, retrieved[i]);
    }

    for (let i = 0; i < totalCount && i < cols * rows; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const isActive = retrievedIndices.has(i);
      const ep = episodeByIndex.get(i) ?? null;

      this.blocks.push({
        x: offsetX + col * (blockW + gap),
        y: offsetY + row * (blockH + gap),
        w: blockW,
        h: blockH,
        episode: ep,
        isActive,
        glowIntensity: 0,
        targetGlow: isActive ? 1 : 0,
      });
    }
  }

  private startAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }

    let frame = 0;
    const animate = () => {
      frame++;
      this.animateStep(frame);
      this.render(frame);
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  private animateStep(frame: number): void {
    for (const block of this.blocks) {
      // Ease glow toward target with staggered timing
      const speed = block.isActive ? 0.08 : 0.04;
      block.glowIntensity +=
        (block.targetGlow - block.glowIntensity) * speed;

      // Active blocks pulse gently
      if (block.isActive && frame > 30) {
        const pulse = Math.sin(frame * 0.04 + block.x * 0.1) * 0.15;
        block.targetGlow = 0.7 + pulse;
      }
    }
  }

  private render(frame: number): void {
    if (!this.snapshot) return;

    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, w, h);

    // Draw background
    this.ctx.fillStyle = COLORS.bgDark;
    this.ctx.beginPath();
    this.ctx.roundRect(0, 0, w, h, 8);
    this.ctx.fill();

    // --- Draw memory blocks ---
    for (const block of this.blocks) {
      this.drawBlock(block);
    }

    // --- Draw budget arc gauge (right side) ---
    this.drawBudgetArc(w, h);

    // --- Draw keyword row at bottom ---
    this.drawKeywords(w, h);

    // Stop animating after settle (save CPU)
    if (frame > 300) {
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }
  }

  private drawBlock(block: BlockPosition): void {
    const { x, y, w, h, isActive, glowIntensity, episode } = block;
    const isHovered = this.hoveredBlock === block;

    if (isActive && glowIntensity > 0.1) {
      // Glow shadow
      const color =
        episode?.kind === 'summary' ? COLORS.summaryGlow : COLORS.turnGlow;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 8 * glowIntensity;
    }

    // Block fill
    if (isActive) {
      const baseColor =
        episode?.kind === 'summary'
          ? COLORS.summaryActive
          : COLORS.turnActive;
      this.ctx.globalAlpha = 0.3 + glowIntensity * 0.7;
      this.ctx.fillStyle = baseColor;
    } else {
      this.ctx.globalAlpha = isHovered ? 0.6 : 0.35;
      this.ctx.fillStyle = isHovered ? COLORS.gridCellHover : COLORS.gridCell;
    }

    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, 2);
    this.ctx.fill();

    // Reset shadow and alpha
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;
  }

  private drawBudgetArc(canvasW: number, canvasH: number): void {
    if (!this.snapshot) return;

    const centerX = canvasW - 36;
    const centerY = 50;
    const radius = 26;
    const lineWidth = 5;
    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const ratio = Math.min(this.snapshot.budgetUsedRatio, 1);

    // Background arc
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    this.ctx.strokeStyle = COLORS.budgetArc;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();

    // Fill arc
    const fillAngle = startAngle + (endAngle - startAngle) * ratio;
    let fillColor = COLORS.budgetFill;
    if (ratio > 0.85) fillColor = COLORS.budgetHigh;
    else if (ratio > 0.65) fillColor = COLORS.budgetWarn;

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, startAngle, fillAngle);
    this.ctx.strokeStyle = fillColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();

    // Percentage text
    const pct = Math.round(ratio * 100);
    this.ctx.fillStyle = COLORS.textBright;
    this.ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(`${pct}%`, centerX, centerY);

    // Label
    this.ctx.fillStyle = COLORS.textDim;
    this.ctx.font = '9px Inter, system-ui, sans-serif';
    this.ctx.fillText('context', centerX, centerY + radius + 12);
  }

  private drawKeywords(canvasW: number, canvasH: number): void {
    if (!this.snapshot) return;

    const keywords = this.snapshot.queryKeywords.slice(0, 8);
    if (keywords.length === 0) return;

    const matchedSet = new Set(
      this.snapshot.retrievedEpisodes.flatMap((e) => e.matchedKeywords),
    );

    let cursorX = 8;
    const y = canvasH - 20;
    const pillHeight = 16;
    const pillPadding = 8;
    const maxX = canvasW - 80;

    this.ctx.font = '9px Inter, system-ui, sans-serif';

    for (const kw of keywords) {
      const textW = this.ctx.measureText(kw).width;
      const pillW = textW + pillPadding * 2;

      if (cursorX + pillW > maxX) break;

      const isMatched = matchedSet.has(kw);

      // Pill background
      this.ctx.fillStyle = isMatched
        ? COLORS.keywordMatchPill
        : COLORS.keywordPill;
      this.ctx.beginPath();
      this.ctx.roundRect(cursorX, y, pillW, pillHeight, pillHeight / 2);
      this.ctx.fill();

      // Pill text
      this.ctx.fillStyle = isMatched
        ? COLORS.keywordMatchText
        : COLORS.keywordText;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(kw, cursorX + pillPadding, y + pillHeight / 2);

      cursorX += pillW + 4;
    }

    if (keywords.length < this.snapshot.queryKeywords.length) {
      this.ctx.fillStyle = COLORS.textDim;
      this.ctx.fillText(
        `+${this.snapshot.queryKeywords.length - keywords.length}`,
        cursorX + 2,
        y + pillHeight / 2,
      );
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: BlockPosition | null = null;
    for (const block of this.blocks) {
      if (
        block.isActive &&
        mx >= block.x &&
        mx <= block.x + block.w &&
        my >= block.y &&
        my <= block.y + block.h
      ) {
        found = block;
        break;
      }
    }

    if (found !== this.hoveredBlock) {
      this.hoveredBlock = found;
      if (found?.episode) {
        this.showTooltip(found, e);
      } else {
        this.tooltipEl.style.display = 'none';
      }
      // Re-render if settled
      if (this.animationFrame === null) {
        this.render(999);
      }
    }
  }

  private onMouseLeave(): void {
    this.hoveredBlock = null;
    this.tooltipEl.style.display = 'none';
    if (this.animationFrame === null) {
      this.render(999);
    }
  }

  private showTooltip(block: BlockPosition, e: MouseEvent): void {
    if (!block.episode) return;

    const ep = block.episode;
    const kindLabel = ep.kind === 'summary' ? 'Summary' : 'Conversation';
    const scoreLabel = `Score: ${(ep.score * 100).toFixed(0)}%`;
    const matchLabel =
      ep.matchedKeywords.length > 0
        ? `Matched: ${ep.matchedKeywords.join(', ')}`
        : '';

    this.tooltipEl.innerHTML = `
      <div class="memory-viz-tooltip-kind ${ep.kind}">${kindLabel}</div>
      <div class="memory-viz-tooltip-summary">${this.escapeHtml(ep.summary)}</div>
      <div class="memory-viz-tooltip-meta">${scoreLabel}</div>
      ${matchLabel ? `<div class="memory-viz-tooltip-meta">${this.escapeHtml(matchLabel)}</div>` : ''}
    `;
    this.tooltipEl.style.display = 'block';

    const rect = this.container.getBoundingClientRect();
    const tx = e.clientX - rect.left + 12;
    const ty = e.clientY - rect.top - 8;
    this.tooltipEl.style.left = `${Math.min(tx, rect.width - 200)}px`;
    this.tooltipEl.style.top = `${ty}px`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Creates the inline context ribbon HTML that sits below a model response.
 * Contains a collapsed summary line and an expandable canvas visualization.
 */
export function createContextRibbon(
  snapshot: ContextRetrievalSnapshot,
): HTMLDivElement {
  const ribbon = document.createElement('div');
  ribbon.className = 'context-ribbon';

  const epCount = snapshot.retrievedEpisodes.length;
  const budgetPct = Math.round(snapshot.budgetUsedRatio * 100);

  // --- Collapsed summary line ---
  const summaryLine = document.createElement('div');
  summaryLine.className = 'context-ribbon-summary';
  summaryLine.innerHTML = `
    <svg class="context-ribbon-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
    <span class="context-ribbon-text">${epCount} ${epCount === 1 ? 'memory' : 'memories'} recalled</span>
    <span class="context-ribbon-budget-pill ${budgetPct > 85 ? 'high' : budgetPct > 65 ? 'warn' : ''}">${budgetPct}% context</span>
    <svg class="context-ribbon-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
  `;
  ribbon.appendChild(summaryLine);

  // --- Expandable detail area ---
  const detail = document.createElement('div');
  detail.className = 'context-ribbon-detail';
  detail.style.display = 'none';

  // Canvas container for the memory block visualization
  const vizContainer = document.createElement('div');
  vizContainer.className = 'context-ribbon-viz-container';
  detail.appendChild(vizContainer);

  // Retrieved episode list
  if (snapshot.retrievedEpisodes.length > 0) {
    const epList = document.createElement('div');
    epList.className = 'context-ribbon-episodes';

    for (const ep of snapshot.retrievedEpisodes) {
      const row = document.createElement('div');
      row.className = 'context-ribbon-episode';
      const scorePct = Math.round(ep.score * 100);
      const kindIcon =
        ep.kind === 'summary'
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      row.innerHTML = `
        <span class="context-ribbon-episode-icon ${ep.kind}">${kindIcon}</span>
        <span class="context-ribbon-episode-text">${escapeHtml(ep.summary)}</span>
        <span class="context-ribbon-episode-score" style="opacity: ${0.4 + ep.score * 0.6}">${scorePct}%</span>
      `;
      epList.appendChild(row);
    }
    detail.appendChild(epList);
  }

  ribbon.appendChild(detail);

  // Toggle expand/collapse
  let viz: MemoryVisualization | null = null;
  summaryLine.addEventListener('click', () => {
    const isExpanded = detail.style.display !== 'none';
    detail.style.display = isExpanded ? 'none' : 'block';
    ribbon.classList.toggle('expanded', !isExpanded);

    if (!isExpanded && !viz) {
      viz = new MemoryVisualization(vizContainer);
      viz.update(snapshot);
    }
  });

  return ribbon;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
