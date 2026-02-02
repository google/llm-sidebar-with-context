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

import { BackgroundController } from './controllers/BackgroundController';
import {
  ChromeLocalStorageService,
  ChromeSyncStorageService,
} from './services/storageService';
import { ChromeTabService } from './services/tabService';
import { GeminiService } from './services/geminiService';
import { ChromeMessageService } from './services/messageService';
import { ChatHistory } from './models/ChatHistory';
import { ContextManager } from './models/ContextManager';

const localStorageService = new ChromeLocalStorageService();
const syncStorageService = new ChromeSyncStorageService();
const tabService = new ChromeTabService();
const geminiService = new GeminiService();
const messageService = new ChromeMessageService();

const chatHistory = new ChatHistory(localStorageService);
const contextManager = new ContextManager(localStorageService, tabService);

const controller = new BackgroundController(
  chatHistory,
  contextManager,
  syncStorageService,
  tabService,
  geminiService,
  messageService,
);

controller.start();
