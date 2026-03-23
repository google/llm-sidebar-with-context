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

import { describe, it, expect } from 'vitest';
import { RetrieverRankerService } from '../../../src/scripts/memory/domains/retrieverRanker/RetrieverRankerService';
import { EVAL_CORPUS } from './evalCorpus';
import { computeRecall, computePrecision, computeF1 } from './evalHelpers';

describe('Memory Eval Harness', () => {
  const service = new RetrieverRankerService();

  for (const scenario of EVAL_CORPUS) {
    it(`scenario: ${scenario.name}`, () => {
      const { candidates, diagnostics } =
        service.retrieveAndRankWithDiagnostics(
          scenario.query,
          scenario.seedEpisodes,
        );

      const retrievedIds = candidates.map((c) => c.episodeId);
      const recall = computeRecall(retrievedIds, scenario.expectedEpisodeIds);
      const precision = computePrecision(
        retrievedIds,
        scenario.expectedEpisodeIds,
      );
      const f1 = computeF1(recall, precision);

      if (scenario.expectedEpisodeIds.length > 0) {
        expect(recall).toBeGreaterThanOrEqual(0.8);
      } else {
        expect(retrievedIds).toHaveLength(0);
      }

      if (scenario.forbiddenEpisodeIds) {
        for (const forbidden of scenario.forbiddenEpisodeIds) {
          expect(retrievedIds).not.toContain(forbidden);
        }
      }

      expect(diagnostics.candidateCount).toBe(scenario.seedEpisodes.length);

      // Log for observability during test runs
      console.log(
        `[eval] ${scenario.name}: recall=${recall.toFixed(2)}` +
          ` precision=${precision.toFixed(2)} f1=${f1.toFixed(2)}` +
          ` selected=${candidates.length}` +
          ` aboveThreshold=${diagnostics.aboveThresholdCount}`,
      );
    });
  }

  it('threshold sweep — informational', () => {
    const thresholds = [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8];
    const scenariosWithExpected = EVAL_CORPUS.filter(
      (s) => s.expectedEpisodeIds.length > 0,
    );

    for (const threshold of thresholds) {
      let totalRecall = 0;
      let totalPrecision = 0;

      for (const scenario of scenariosWithExpected) {
        const { candidates } = service.retrieveAndRankWithDiagnostics(
          scenario.query,
          scenario.seedEpisodes,
          { minScoreThreshold: threshold },
        );
        const ids = candidates.map((c) => c.episodeId);
        totalRecall += computeRecall(ids, scenario.expectedEpisodeIds);
        totalPrecision += computePrecision(ids, scenario.expectedEpisodeIds);
      }

      const avgRecall = totalRecall / scenariosWithExpected.length;
      const avgPrecision = totalPrecision / scenariosWithExpected.length;
      const avgF1 = computeF1(avgRecall, avgPrecision);

      console.log(
        `[sweep] threshold=${threshold.toFixed(2)}` +
          ` avgRecall=${avgRecall.toFixed(2)}` +
          ` avgPrecision=${avgPrecision.toFixed(2)}` +
          ` avgF1=${avgF1.toFixed(2)}`,
      );
    }

    // Informational test — always passes
    expect(true).toBe(true);
  });
});
