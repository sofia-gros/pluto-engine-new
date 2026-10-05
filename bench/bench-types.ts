export interface BenchScene {
  name: string;
  setup(game: unknown, count: number): void | Promise<void>;
  step?(frame: number): void;
}

export interface BenchResult {
  scene: string;
  backend: string;
  build: string;
  count: number;
  meanMs: number;
  p50Ms: number;
  p99Ms: number;
  gpuMs?: number;
}
