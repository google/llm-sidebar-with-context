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
import { computeRecall, computePrecision, computeF1 } from './evalHelpers';

describe('evalHelpers', () => {
  describe('computeRecall', () => {
    it('should return 1 when all expected are retrieved', () => {
      expect(computeRecall(['a', 'b', 'c'], ['a', 'b'])).toBe(1);
    });

    it('should return 0 when none expected are retrieved', () => {
      expect(computeRecall(['x', 'y'], ['a', 'b'])).toBe(0);
    });

    it('should return 0.5 for partial overlap', () => {
      expect(computeRecall(['a', 'x'], ['a', 'b'])).toBe(0.5);
    });

    it('should return 1 when expected is empty', () => {
      expect(computeRecall(['a'], [])).toBe(1);
    });

    it('should return 0 when retrieved is empty but expected is not', () => {
      expect(computeRecall([], ['a'])).toBe(0);
    });

    it('should return 1 when both are empty', () => {
      expect(computeRecall([], [])).toBe(1);
    });
  });

  describe('computePrecision', () => {
    it('should return 1 when all retrieved are expected', () => {
      expect(computePrecision(['a', 'b'], ['a', 'b', 'c'])).toBe(1);
    });

    it('should return 0 when no retrieved are expected', () => {
      expect(computePrecision(['x', 'y'], ['a', 'b'])).toBe(0);
    });

    it('should return 0.5 for partial overlap', () => {
      expect(computePrecision(['a', 'x'], ['a', 'b'])).toBe(0.5);
    });

    it('should return 1 when both are empty', () => {
      expect(computePrecision([], [])).toBe(1);
    });

    it('should return 0 when retrieved is empty but expected is not', () => {
      expect(computePrecision([], ['a'])).toBe(0);
    });
  });

  describe('computeF1', () => {
    it('should return 1 for perfect recall and precision', () => {
      expect(computeF1(1, 1)).toBe(1);
    });

    it('should return 0 when both are 0', () => {
      expect(computeF1(0, 0)).toBe(0);
    });

    it('should compute harmonic mean', () => {
      expect(computeF1(0.5, 1.0)).toBeCloseTo(0.6667, 3);
    });

    it('should return 0 when either is 0', () => {
      expect(computeF1(0, 1)).toBe(0);
      expect(computeF1(1, 0)).toBe(0);
    });
  });
});
