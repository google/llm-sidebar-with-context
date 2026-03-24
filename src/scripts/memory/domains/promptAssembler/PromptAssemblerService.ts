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

import { ContentPart } from '../../../types';
import { IPromptAssemblerService } from '../../contracts/IPromptAssemblerService';
import { PromptAssemblyInput } from '../../types/domain';

export class PromptAssemblerService implements IPromptAssemblerService {
  assemblePromptContext(input: PromptAssemblyInput): ContentPart | null {
    const header =
      '--- Retrieved Long-Term Memory ---\nUse these recalled notes as background context:\n';
    let text = header;
    let added = 0;

    for (const line of input.memoryLines) {
      const entry = `- ${line}\n`;
      if (text.length + entry.length > input.maxChars) {
        break;
      }
      text += entry;
      added += 1;
    }

    if (added === 0) {
      return null;
    }
    return { type: 'text', text: text.trimEnd() };
  }
}
