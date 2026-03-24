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
import { PromptAssemblerService } from '../../../src/scripts/memory/domains/promptAssembler/PromptAssemblerService';

describe('PromptAssemblerService', () => {
  const service = new PromptAssemblerService();

  it('should return null when no entries fit in budget', () => {
    const part = service.assemblePromptContext({
      memoryLines: ['This is a long line'],
      maxChars: 10,
    });
    expect(part).toBeNull();
  });

  it('should assemble entries under budget', () => {
    const part = service.assemblePromptContext({
      memoryLines: ['line one', 'line two'],
      maxChars: 500,
    });

    expect(part?.type).toBe('text');
    if (part?.type === 'text') {
      expect(part.text).toContain('Retrieved Long-Term Memory');
      expect(part.text).toContain('line one');
      expect(part.text).toContain('line two');
    }
  });
});
