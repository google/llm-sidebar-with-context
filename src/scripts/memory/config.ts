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

import {
  MEMORY_COMPACTION_BATCH_SIZE,
  MEMORY_EPISODE_SUMMARY_MAX_CHARS,
  MEMORY_MAX_EPISODES,
  MEMORY_MAX_KEYWORDS_PER_EPISODE,
  MEMORY_MAX_QUERY_KEYWORDS,
  MEMORY_MIN_KEYWORD_LENGTH,
  MEMORY_MIN_SCORE_THRESHOLD,
  MEMORY_NEIGHBOR_EXPANSION_LIMIT,
  MEMORY_PROMPT_CHAR_BUDGET,
  MEMORY_RECENT_EPISODES_TO_KEEP_RAW,
  MEMORY_RETRIEVAL_TOP_K,
  MEMORY_STOPWORDS,
} from '../constants';
import { MemoryRequester } from './types/domain';

export const MEMORY_SCHEMA_VERSION = 2;

export const DEFAULT_MEMORY_REQUESTER: MemoryRequester = {
  agentId: 'primary-agent',
  teamId: 'default-team',
};

export {
  MEMORY_COMPACTION_BATCH_SIZE,
  MEMORY_EPISODE_SUMMARY_MAX_CHARS,
  MEMORY_MAX_EPISODES,
  MEMORY_MAX_KEYWORDS_PER_EPISODE,
  MEMORY_MAX_QUERY_KEYWORDS,
  MEMORY_MIN_KEYWORD_LENGTH,
  MEMORY_MIN_SCORE_THRESHOLD,
  MEMORY_NEIGHBOR_EXPANSION_LIMIT,
  MEMORY_PROMPT_CHAR_BUDGET,
  MEMORY_RECENT_EPISODES_TO_KEEP_RAW,
  MEMORY_RETRIEVAL_TOP_K,
  MEMORY_STOPWORDS,
};
