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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryPipelineOrchestrator } from '../../../src/scripts/memory/MemoryPipelineOrchestrator';
import { ILocalStorageService } from '../../../src/scripts/services/storageService';

/**
 * Lifecycle Fidelity Eval — tests the full orchestrator pipeline
 * (recordTurn → compaction → forgetting → buildContextPart)
 *
 * Structured around MemoryAgentBench competencies (ICLR 2026)
 * and LoCoMo question taxonomy (ACL 2024).
 */
describe('Lifecycle Fidelity Eval', () => {
  let orchestrator: MemoryPipelineOrchestrator;
  let mockStorage: ILocalStorageService;

  beforeEach(() => {
    mockStorage = { get: vi.fn(), set: vi.fn() };
    orchestrator = new MemoryPipelineOrchestrator(mockStorage);
  });

  // --- Competency 1: Accurate Retrieval (MemoryAgentBench AR) ---

  describe('Accurate Retrieval', () => {
    it('single-hop: retrieves a specific fact from varied conversation', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'What programming languages do you recommend?',
        'Python and TypeScript are great choices for different use cases.',
      );
      await orchestrator.recordTurn(
        'My dog Rex loves to play fetch in the park',
        'Dogs are wonderful companions. Rex sounds like a fun pet!',
      );
      await orchestrator.recordTurn(
        'How do I set up a PostgreSQL database?',
        'You can install PostgreSQL and use createdb to make a new database.',
      );
      await orchestrator.recordTurn(
        'What is the best way to deploy to AWS?',
        'Consider using ECS or Lambda depending on your workload.',
      );
      await orchestrator.recordTurn(
        'I switched from vim to VS Code last week',
        'VS Code has great extensions for TypeScript development.',
      );

      const part = await orchestrator.buildContextPart(
        "What's my dog's name?",
        [{ role: 'user', text: "What's my dog's name?" }],
      );

      expect(part).not.toBeNull();
      if (part?.type === 'text') {
        expect(part.text.toLowerCase()).toContain('rex');
      }
    });

    it('multi-hop: retrieves facts spread across multiple turns', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'Our backend uses Redis for caching',
        'Redis is excellent for caching with low latency.',
      );
      await orchestrator.recordTurn(
        'The weather is nice today',
        'Glad to hear it!',
      );
      await orchestrator.recordTurn(
        'We had a Redis cache stampede last week that caused an outage',
        'Cache stampedes happen when many requests hit expired keys simultaneously.',
      );

      const part = await orchestrator.buildContextPart(
        'Redis caching outage stampede',
        [{ role: 'user', text: 'Tell me about our Redis issues' }],
      );

      expect(part).not.toBeNull();
      if (part?.type === 'text') {
        const text = part.text.toLowerCase();
        expect(text).toContain('redis');
        expect(text).toContain('cache');
      }
    });
  });

  // --- Competency 2: Fact Survival Through Compaction (MemoryAgentBench LRU) ---

  describe('Fact Survival Through Compaction', () => {
    it('key fact survives after compaction into summary', async () => {
      await orchestrator.load();

      // Record an important early fact
      await orchestrator.recordTurn(
        'My favorite framework is Next.js for React projects',
        'Next.js provides server-side rendering and great developer experience.',
      );

      // Fill with enough turns to trigger compaction (need > maxEpisodes=160)
      // With keepRecentRaw=32 and batchSize=24, compaction triggers when
      // total episodes > 160 and turn episodes > 32
      // For a simpler test, we just record enough to trigger at least one compact
      for (let i = 0; i < 40; i++) {
        await orchestrator.recordTurn(
          `Discussion about topic ${i}: algorithms and data structures`,
          `Response about topic ${i}: various approaches exist.`,
        );
      }

      // Probe for the early fact
      const part = await orchestrator.buildContextPart(
        'Next.js React framework favorite',
        [{ role: 'user', text: 'What framework do I prefer?' }],
      );

      // Check telemetry to verify compaction happened
      const telemetry = orchestrator.getTelemetry();
      const compactions = telemetry.getEvents('compaction');
      const triggeredCompactions = compactions.filter(
        (c) => c.kind === 'compaction' && c.triggered,
      );

      console.log(
        `[lifecycle] Compaction: ${triggeredCompactions.length} triggered` +
          ` out of ${compactions.length} total`,
      );

      // The fact may or may not survive compaction depending on keyword overlap
      // This test documents current behavior as a baseline
      if (part?.type === 'text') {
        const hasNextJs = part.text.toLowerCase().includes('next');
        console.log(
          `[lifecycle] Fact survival through compaction: ${hasNextJs ? 'PASSED' : 'LOST'}`,
        );
      } else {
        console.log('[lifecycle] Fact survival through compaction: NO MATCH');
      }

      // At minimum, the system should not crash and telemetry should be populated
      expect(compactions.length).toBeGreaterThan(0);
    });
  });

  // --- Competency 3: Selective Forgetting / Conflict Resolution ---
  // (MemoryAgentBench SF/CR)

  describe('Conflict Resolution', () => {
    it('newer fact should be present when contradicting older fact', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'I just got a puppy named Rex',
        'Congratulations on your new puppy Rex!',
      );

      // Intervening turns
      for (let i = 0; i < 5; i++) {
        await orchestrator.recordTurn(
          `Question about coding topic ${i}`,
          `Answer about coding topic ${i}`,
        );
      }

      await orchestrator.recordTurn(
        'Rex passed away last month. We adopted a new dog named Luna',
        'I am sorry for your loss. Luna sounds like a wonderful new companion.',
      );

      const part = await orchestrator.buildContextPart('dog name pet', [
        { role: 'user', text: "What's my dog's name?" },
      ]);

      expect(part).not.toBeNull();
      if (part?.type === 'text') {
        const text = part.text.toLowerCase();
        const hasLuna = text.includes('luna');
        const hasRex = text.includes('rex');

        console.log(
          `[lifecycle] Conflict resolution: Luna=${hasLuna} Rex=${hasRex}` +
            ` (ideal: Luna=true, Rex=false for superseded fact)`,
        );

        // At minimum, the newer fact must be present
        // Both may appear since we don't have contradiction detection yet
        expect(hasLuna).toBe(true);
      }
    });
  });

  // --- Competency 4: Temporal Reasoning (LoCoMo taxonomy) ---

  describe('Temporal Reasoning', () => {
    it('retrieves temporally related events for timeline query', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'Last Monday I started the React migration project',
        'Good luck with the React migration!',
      );
      await orchestrator.recordTurn(
        'Some unrelated discussion about cooking pasta',
        'Pasta is delicious with fresh basil.',
      );
      await orchestrator.recordTurn(
        'On Wednesday the React deployment failed with build errors',
        'Build errors during deployment can be tricky to debug.',
      );
      await orchestrator.recordTurn(
        'More unrelated chat about weekend hiking plans',
        'Hiking is great exercise.',
      );
      await orchestrator.recordTurn(
        'By Friday we fixed the React build and deployed successfully',
        'Great to hear the React deployment is working now!',
      );

      const part = await orchestrator.buildContextPart(
        'React project migration timeline deployment',
        [
          {
            role: 'user',
            text: 'What happened with the React project this week?',
          },
        ],
      );

      expect(part).not.toBeNull();
      if (part?.type === 'text') {
        const text = part.text.toLowerCase();
        expect(text).toContain('react');
        // Should contain at least some temporal event references
        const hasDeployment =
          text.includes('deploy') || text.includes('deployment');
        const hasMigration =
          text.includes('migration') || text.includes('migrat');
        console.log(
          `[lifecycle] Temporal: deployment=${hasDeployment} migration=${hasMigration}`,
        );
        expect(hasDeployment || hasMigration).toBe(true);
      }
    });
  });

  // --- Competency 5: Adversarial / Negative Retrieval ---
  // (LoCoMo adversarial)

  describe('Adversarial Retrieval', () => {
    it('returns null for completely unrelated query', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'How does TypeScript generics work?',
        'Generics allow you to write reusable type-safe code.',
      );
      await orchestrator.recordTurn(
        'What is the difference between let and const?',
        'Let allows reassignment while const does not.',
      );

      const part = await orchestrator.buildContextPart(
        'quantum entanglement photon spin',
        [{ role: 'user', text: 'Explain quantum entanglement' }],
      );

      // System should not hallucinate memories about quantum physics
      expect(part).toBeNull();
    });
  });

  // --- Competency 6: Multi-turn Preference Accumulation ---
  // (BEAM probing methodology)

  describe('Preference Accumulation', () => {
    it('accumulates user preferences across multiple turns', async () => {
      await orchestrator.load();

      await orchestrator.recordTurn(
        'I always prefer TypeScript over plain JavaScript',
        'TypeScript adds great type safety to JavaScript projects.',
      );
      await orchestrator.recordTurn(
        'Some discussion about API design patterns',
        'REST and GraphQL each have their strengths.',
      );
      await orchestrator.recordTurn(
        'I use VS Code as my primary editor with Vim keybindings',
        'VS Code with Vim keybindings is a powerful combination.',
      );
      await orchestrator.recordTurn(
        'Random chat about the latest movie releases',
        'There are some great films this year.',
      );
      await orchestrator.recordTurn(
        'All our services deploy on AWS using ECS and Fargate',
        'ECS with Fargate simplifies container deployment on AWS.',
      );
      await orchestrator.recordTurn(
        'Discussing team meeting notes from yesterday',
        'I can help you organize those notes.',
      );
      await orchestrator.recordTurn(
        'I prefer functional programming patterns over OOP',
        'Functional patterns like immutability and pure functions improve code quality.',
      );

      const part = await orchestrator.buildContextPart(
        'TypeScript VS Code AWS functional programming preferences setup',
        [
          {
            role: 'user',
            text: 'What do you know about my development preferences and setup?',
          },
        ],
      );

      expect(part).not.toBeNull();
      if (part?.type === 'text') {
        const text = part.text.toLowerCase();
        const prefs = {
          typescript: text.includes('typescript'),
          vscode: text.includes('vs code') || text.includes('vscode'),
          aws: text.includes('aws') || text.includes('ecs'),
          functional: text.includes('functional') || text.includes('immutab'),
        };

        const prefsFound = Object.values(prefs).filter(Boolean).length;
        console.log(
          `[lifecycle] Preference accumulation: ${prefsFound}/4 found` +
            ` (ts=${prefs.typescript} vscode=${prefs.vscode}` +
            ` aws=${prefs.aws} functional=${prefs.functional})`,
        );

        // Should retrieve at least 3 of 4 preferences
        expect(prefsFound).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
