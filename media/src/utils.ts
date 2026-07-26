import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SHELL_ENV = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` };

export function run(cmd: string, label: string): string {
  console.log(`[${label}] Running: ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], env: SHELL_ENV });
}

export function runVisible(cmd: string, label: string): void {
  console.log(`[${label}] Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: SHELL_ENV });
}

export function ensureDir(...dirs: string[]): void {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function checkTool(name: string, installHint: string): boolean {
  try {
    execSync(`which ${name}`, { encoding: 'utf-8', stdio: 'pipe', env: SHELL_ENV });
    return true;
  } catch {
    console.error(`❌ ${name} not found. Install with: ${installHint}`);
    return false;
  }
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fileSizeMB(filePath: string): string {
  const stats = fs.statSync(filePath);
  return (stats.size / (1024 * 1024)).toFixed(1);
}

export function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function saveJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved: ${filePath}`);
}

export function getFrameTimestamp(frameNumber: number, interval: number): number {
  return (frameNumber - 1) * interval;
}
