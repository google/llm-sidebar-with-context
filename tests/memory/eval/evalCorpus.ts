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

import { EvalScenario, makeEvalEpisode, makeEvalQuery } from './evalHelpers';

const NOW = Date.now();
const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

export const EVAL_CORPUS: EvalScenario[] = [
  {
    name: 'Exact keyword match — high relevance',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'redis-1',
        summary: 'Redis cache stampede mitigation using probabilistic locking',
        keywords: ['redis', 'cache', 'stampede', 'mitigation', 'locking'],
        createdAt: NOW - 2 * HOUR,
      }),
      makeEvalEpisode({
        id: 'ui-1',
        summary: 'UI palette discussion about dark mode colors',
        keywords: ['palette', 'colors', 'dark', 'mode'],
        createdAt: NOW - 2 * HOUR,
      }),
    ],
    query: makeEvalQuery('redis cache stampede mitigation'),
    expectedEpisodeIds: ['redis-1'],
    forbiddenEpisodeIds: ['ui-1'],
  },

  {
    name: 'Partial keyword overlap — substring matching',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'caching-1',
        summary: 'Discussed caching strategies for API responses',
        keywords: ['caching', 'strategies', 'api', 'responses'],
        createdAt: NOW - 3 * HOUR,
      }),
      makeEvalEpisode({
        id: 'deploy-1',
        summary: 'Deployment pipeline configuration',
        keywords: ['deployment', 'pipeline', 'configuration'],
        createdAt: NOW - 3 * HOUR,
      }),
    ],
    query: makeEvalQuery('cache strategy for API'),
    expectedEpisodeIds: ['caching-1'],
    forbiddenEpisodeIds: ['deploy-1'],
  },

  {
    name: 'Recency bias — recent over old with same keywords',
    questionType: 'temporal',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'auth-old',
        summary: 'Old discussion about authentication tokens',
        keywords: ['authentication', 'tokens', 'security'],
        createdAt: NOW - 30 * DAY,
      }),
      makeEvalEpisode({
        id: 'auth-new',
        summary: 'Recent discussion about authentication tokens',
        keywords: ['authentication', 'tokens', 'security'],
        createdAt: NOW - 1 * HOUR,
      }),
    ],
    query: makeEvalQuery('authentication tokens security'),
    expectedEpisodeIds: ['auth-new'],
  },

  {
    name: 'Summary boost — summary episodes rank higher',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'db-turn',
        summary: 'User asked about database indexing',
        keywords: ['database', 'indexing', 'optimization', 'query'],
        createdAt: NOW - 5 * HOUR,
        kind: 'turn',
      }),
      makeEvalEpisode({
        id: 'db-summary',
        summary:
          'Consolidated memory: database indexing strategies and optimization',
        keywords: ['database', 'indexing', 'optimization', 'query', 'btree'],
        createdAt: NOW - 4 * HOUR,
        kind: 'summary',
      }),
    ],
    query: makeEvalQuery('database indexing optimization'),
    expectedEpisodeIds: ['db-summary'],
  },

  {
    name: 'High-access utility — frequently accessed memories rank higher',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'api-low',
        summary: 'API rate limiting discussion',
        keywords: ['api', 'rate', 'limiting', 'throttle'],
        createdAt: NOW - 10 * HOUR,
        accessCount: 0,
      }),
      makeEvalEpisode({
        id: 'api-high',
        summary: 'API rate limiting best practices',
        keywords: ['api', 'rate', 'limiting', 'practices'],
        createdAt: NOW - 10 * HOUR,
        accessCount: 15,
      }),
    ],
    query: makeEvalQuery('api rate limiting'),
    expectedEpisodeIds: ['api-high'],
  },

  {
    name: 'Diversity filter — near-duplicate memories deduplicated',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'dup-1',
        summary: 'Discussed React component lifecycle',
        keywords: ['react', 'component', 'lifecycle'],
        createdAt: NOW - 2 * HOUR,
      }),
      makeEvalEpisode({
        id: 'dup-2',
        summary: 'React component lifecycle hooks explained',
        keywords: ['react', 'component', 'lifecycle'],
        createdAt: NOW - 3 * HOUR,
      }),
      makeEvalEpisode({
        id: 'unrelated',
        summary: 'Python data processing pipeline',
        keywords: ['python', 'data', 'processing', 'pipeline'],
        createdAt: NOW - 2 * HOUR,
      }),
    ],
    query: makeEvalQuery('react component lifecycle', { maxResults: 2 }),
    expectedEpisodeIds: ['dup-1'],
  },

  {
    name: 'No relevant memories — should return empty',
    questionType: 'adversarial',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'irrelevant-1',
        summary: 'Cooking recipe for pasta',
        keywords: ['cooking', 'recipe', 'pasta', 'sauce'],
        createdAt: NOW - 1 * HOUR,
      }),
    ],
    query: makeEvalQuery('kubernetes pod scheduling'),
    expectedEpisodeIds: [],
  },

  {
    name: 'Multi-topic retrieval — finds specific topic among many',
    questionType: 'single-hop',
    seedEpisodes: [
      makeEvalEpisode({
        id: 'topic-1',
        summary: 'GraphQL schema design patterns',
        keywords: ['graphql', 'schema', 'design', 'patterns'],
        createdAt: NOW - 4 * HOUR,
      }),
      makeEvalEpisode({
        id: 'topic-2',
        summary: 'REST API versioning strategies',
        keywords: ['rest', 'api', 'versioning', 'strategies'],
        createdAt: NOW - 4 * HOUR,
      }),
      makeEvalEpisode({
        id: 'topic-3',
        summary: 'WebSocket connection pooling',
        keywords: ['websocket', 'connection', 'pooling'],
        createdAt: NOW - 4 * HOUR,
      }),
      makeEvalEpisode({
        id: 'topic-4',
        summary: 'Docker container orchestration',
        keywords: ['docker', 'container', 'orchestration'],
        createdAt: NOW - 4 * HOUR,
      }),
    ],
    query: makeEvalQuery('graphql schema design'),
    expectedEpisodeIds: ['topic-1'],
    forbiddenEpisodeIds: ['topic-2', 'topic-3', 'topic-4'],
  },
];
