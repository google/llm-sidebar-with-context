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
import { WorkingContextService } from '../../../src/scripts/memory/domains/workingContext/WorkingContextService';

describe('WorkingContextService', () => {
  const service = new WorkingContextService();

  it('should return bounded recent turns', () => {
    const context = service.buildWorkingContext(
      [
        { role: 'user', text: 'u1' },
        { role: 'model', text: 'm1' },
        { role: 'user', text: 'u2' },
      ],
      {
        agentId: 'a1',
        teamId: 't1',
        scope: 'agent',
      },
      2,
    );

    expect(context.turns).toEqual(['m1', 'u2']);
    expect(context.limit).toBe(2);
    expect(context.actor.agentId).toBe('a1');
  });

  it('should handle invalid limits safely', () => {
    const context = service.buildWorkingContext(
      [{ role: 'user', text: 'u1' }],
      {
        agentId: 'a1',
        teamId: 't1',
        scope: 'agent',
      },
      Number.NaN,
    );

    expect(context.turns).toEqual(['u1']);
    expect(context.limit).toBe(0);
  });
});
