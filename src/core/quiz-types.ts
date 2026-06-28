import type { AppMode, NodeId } from './main-types';

export type QuizNodeStatus = 'not-hidden' | 'hidden' | 'revealed' | 'correct' | 'wrong';

export interface QuizConfig {
  hiddenPercent: number;
  includeCentralNodes: boolean;
}

export interface QuizSnapshot {
  active: boolean;
  config: QuizConfig | null;
  previousAppMode: AppMode | null;
  eligibleNodeCount: number;
  hiddenCount: number;
  revealedCount: number;
  remainingCount: number;
  correctCount: number;
  wrongCount: number;
  selectedNodeId: NodeId | null;
  selectedNodeTitle: string | null;
  selectedNodeStatus: QuizNodeStatus | null;
  message: string | null;
}

export type QuizSnapshotListener = (snapshot: QuizSnapshot) => void;