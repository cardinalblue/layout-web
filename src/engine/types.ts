// ============================================================
// Core Types — Auto Layout Engine
// ============================================================

export interface ImageInput {
  id: string;
  aspectRatio: number; // width / height
}

export interface Frame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number; // degrees, only used by Phyllo
}

// ============================================================
// Grid Types
// ============================================================

export type TreeNode = LeafNode | InternalNode;

export interface LeafNode {
  type: 'leaf';
  imageIndex: number;
  ratio: number;
}

export interface InternalNode {
  type: 'internal';
  cut: 'H' | 'V';
  children: [TreeNode, TreeNode];
  ratio: number;
}

export interface GridOptions {
  areaLimit?: number;    // 2–6, default 3
  population?: number;   // 30–100, default 50
  generations?: number;  // 20–80, default 40
}

// ============================================================
// Phyllo Types
// ============================================================

export interface PhylloOptions {
  sizeVar?: number;    // 0–1, default 0.5
  rotation?: number;   // 0–1, default 1.0
  density?: number;    // 0.15–0.55, default 0.55
  maxTrials?: number;  // 1–20, default 10
}

// ============================================================
// Shared / Integration Types
// ============================================================

export interface LayoutOptions {
  seed: number;
  gapPercent: number;     // 1–8, default 4
  paddingPercent: number; // 2–12, default 6.5
  grid?: GridOptions;
  phyllo?: PhylloOptions;
}

export type LayoutMode = 'grid' | 'phyllo';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RNG = () => number;
