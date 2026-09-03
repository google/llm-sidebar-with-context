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

import { marked } from 'marked';
import {
  MessageTypes,
  StorageKeys,
  RestrictedURLs,
  Themes,
  SUPPORTED_MODELS,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_SETTINGS,
  DEFAULT_OPENROUTER_SETTINGS,
  OPENROUTER_FALLBACK_FREE_MODELS,
  Providers,
  GENERAL_TIPS,
  OLLAMA_TIPS,
} from '../constants';
import {
  ExtensionMessage,
  ExtensionResponse,
  TabInfo,
  LLMResponse,
  LLMProvider,
  OllamaSettings,
  OllamaModelsResponse,
  GetContextResponse,
  SuccessResponse,
  CheckPinnedTabsResponse,
  GetHistoryResponse,
  OpenRouterSettings,
  OpenRouterModelConfig,
  OpenRouterVerifyKeyResponse,
  OpenRouterListModelsResponse,
} from '../types';
import { normalizeOllamaHost, toStoredOllamaSettings } from '../ollamaUtils';
import { formatContextLength } from '../utils';
import {
  ISyncStorageService,
  ILocalStorageService,
} from '../services/storageService';
import { IMessageService } from '../services/messageService';
import { OllamaModelsClient } from '../services/ollamaModels';
import { ICONS } from '../../../third_party/lucide/lucideIcons';

export class SidebarController {
  private bottomPanel: HTMLDivElement;
  private promptForm: HTMLFormElement;
  private promptInput: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private messagesDiv: HTMLDivElement;
  private settingsView: HTMLDivElement;
  private settingsError: HTMLDivElement;
  private apiKeyInput: HTMLInputElement;
  private saveSettingsButton: HTMLButtonElement;
  private cancelSettingsButton: HTMLButtonElement;
  private pinnedTabsDiv: HTMLDivElement;
  private currentTabDiv: HTMLDivElement;
  private providerSelect: HTMLSelectElement;
  private modelSelect: HTMLSelectElement;
  private themeSelect: HTMLSelectElement;
  private toggleSettingsButton: HTMLButtonElement;
  private newChatButton: HTMLButtonElement;
  private geminiEnabledToggle: HTMLInputElement;
  private geminiPanelBody: HTMLDivElement;
  private ollamaEnabledToggle: HTMLInputElement;
  private ollamaPanelBody: HTMLDivElement;
  private ollamaStatus: HTMLDivElement;
  private ollamaHostInput: HTMLInputElement;
  private ollamaTestButton: HTMLButtonElement;
  private ollamaResetButton: HTMLButtonElement;
  private ollamaNumCtxInput: HTMLInputElement;
  private ollamaKeepAliveInput: HTMLInputElement;
  private openRouterEnabledToggle: HTMLInputElement;
  private openRouterPanelBody: HTMLDivElement;
  private openRouterStatus: HTMLDivElement;
  private openRouterApiKeyInput: HTMLInputElement;
  private openRouterVerifyButton: HTMLButtonElement;
  private openRouterModeTop5: HTMLInputElement;
  private openRouterModeCustom: HTMLInputElement;
  private openRouterTop5Container: HTMLDivElement;
  private openRouterRefreshTopModelsButton: HTMLButtonElement;
  private openRouterTop5ModelsList: HTMLDivElement;
  private openRouterCustomContainer: HTMLDivElement;
  private openRouterCustomModelsList: HTMLDivElement;
  private openRouterAddModelInput: HTMLInputElement;
  private openRouterRefreshCustomModelsButton: HTMLButtonElement;
  private openRouterResetModelsButton: HTMLButtonElement;
  private openRouterCustomModelsError: HTMLDivElement;
  private openRouterModelsDatalist: HTMLDataListElement;
  private refreshModelsButton: HTMLButtonElement;
  private refreshTickTimeout: ReturnType<typeof setTimeout> | null = null;
  private confirmOverlay: HTMLDivElement;
  private confirmMessage: HTMLParagraphElement;
  private confirmOkButton: HTMLButtonElement;
  private confirmCancelButton: HTMLButtonElement;

  // Sentinel option value in the provider dropdown that opens the settings.
  private static readonly ADD_PROVIDER_OPTION = 'add-provider';

  private pinnedContexts: TabInfo[] = [];
  private currentTab: TabInfo | null = null;
  private isCurrentTabShared: boolean = true;
  private isGenerating: boolean = false;
  private isSettingsOpen: boolean = false;
  // Last valid provider selection (the dropdown may briefly hold the
  // "Add Provider" sentinel).
  private selectedProvider: LLMProvider = Providers.GOOGLE_GEMINI;
  private initialTheme: string = Themes.SYSTEM;
  private initialApiKey: string = '';
  private initialGeminiEnabled: boolean = true;
  private initialOllamaSettings: OllamaSettings = {
    ...DEFAULT_OLLAMA_SETTINGS,
  };
  private initialOpenRouterSettings: OpenRouterSettings = {
    ...DEFAULT_OPENROUTER_SETTINGS,
  };
  private cachedTop5Models: OpenRouterModelConfig[] = [
    ...OPENROUTER_FALLBACK_FREE_MODELS,
  ];
  private currentOpenRouterModels: OpenRouterModelConfig[] = [];
  private cachedAllModels: OpenRouterModelConfig[] = [];

  private ollamaModels: OllamaModelsClient;

  constructor(
    private syncStorageService: ISyncStorageService,
    private localStorageService: ILocalStorageService,
    private messageService: IMessageService,
  ) {
    this.ollamaModels = new OllamaModelsClient(
      syncStorageService,
      localStorageService,
      messageService,
    );
    this.bottomPanel = document.getElementById(
      'bottom-panel',
    ) as HTMLDivElement;
    this.promptForm = document.getElementById('prompt-form') as HTMLFormElement;
    this.promptInput = document.getElementById(
      'prompt-input',
    ) as HTMLInputElement;
    this.submitButton = document.getElementById(
      'send-button',
    ) as HTMLButtonElement;
    this.messagesDiv = document.getElementById('messages') as HTMLDivElement;
    this.settingsView = document.getElementById(
      'settings-view',
    ) as HTMLDivElement;
    this.settingsError = document.getElementById(
      'settings-error',
    ) as HTMLDivElement;
    this.apiKeyInput = document.getElementById(
      'api-key-input',
    ) as HTMLInputElement;
    this.saveSettingsButton = document.getElementById(
      'save-settings-button',
    ) as HTMLButtonElement;
    this.cancelSettingsButton = document.getElementById(
      'cancel-settings-button',
    ) as HTMLButtonElement;
    this.pinnedTabsDiv = document.getElementById(
      'pinned-tabs',
    ) as HTMLDivElement;
    this.currentTabDiv = document.getElementById(
      'current-tab',
    ) as HTMLDivElement;
    this.providerSelect = document.getElementById(
      'provider-select',
    ) as HTMLSelectElement;
    this.modelSelect = document.getElementById(
      'model-select',
    ) as HTMLSelectElement;
    this.themeSelect = document.getElementById(
      'theme-select',
    ) as HTMLSelectElement;
    this.toggleSettingsButton = document.getElementById(
      'toggle-settings-button',
    ) as HTMLButtonElement;
    this.newChatButton = document.getElementById(
      'new-chat-button',
    ) as HTMLButtonElement;
    this.geminiEnabledToggle = document.getElementById(
      'gemini-enabled-toggle',
    ) as HTMLInputElement;
    this.geminiPanelBody = document.getElementById(
      'gemini-panel-body',
    ) as HTMLDivElement;
    this.ollamaEnabledToggle = document.getElementById(
      'ollama-enabled-toggle',
    ) as HTMLInputElement;
    this.ollamaPanelBody = document.getElementById(
      'ollama-panel-body',
    ) as HTMLDivElement;
    this.ollamaStatus = document.getElementById(
      'ollama-status',
    ) as HTMLDivElement;
    this.ollamaHostInput = document.getElementById(
      'ollama-host-input',
    ) as HTMLInputElement;
    this.ollamaTestButton = document.getElementById(
      'ollama-test-button',
    ) as HTMLButtonElement;
    this.ollamaResetButton = document.getElementById(
      'ollama-reset-button',
    ) as HTMLButtonElement;
    this.ollamaNumCtxInput = document.getElementById(
      'ollama-num-ctx-input',
    ) as HTMLInputElement;
    this.ollamaKeepAliveInput = document.getElementById(
      'ollama-keep-alive-input',
    ) as HTMLInputElement;
    this.openRouterEnabledToggle = document.getElementById(
      'openrouter-enabled-toggle',
    ) as HTMLInputElement;
    this.openRouterPanelBody = document.getElementById(
      'openrouter-panel-body',
    ) as HTMLDivElement;
    this.openRouterStatus = document.getElementById(
      'openrouter-status',
    ) as HTMLDivElement;
    this.openRouterApiKeyInput = document.getElementById(
      'openrouter-api-key-input',
    ) as HTMLInputElement;
    this.openRouterVerifyButton = document.getElementById(
      'openrouter-verify-button',
    ) as HTMLButtonElement;
    this.openRouterModeTop5 = document.getElementById(
      'openrouter-mode-top5',
    ) as HTMLInputElement;
    this.openRouterModeCustom = document.getElementById(
      'openrouter-mode-custom',
    ) as HTMLInputElement;
    this.openRouterTop5Container = document.getElementById(
      'openrouter-top5-container',
    ) as HTMLDivElement;
    this.openRouterRefreshTopModelsButton = document.getElementById(
      'openrouter-refresh-top-models-button',
    ) as HTMLButtonElement;
    this.openRouterTop5ModelsList = document.getElementById(
      'openrouter-top5-models-list',
    ) as HTMLDivElement;
    this.openRouterCustomContainer = document.getElementById(
      'openrouter-custom-container',
    ) as HTMLDivElement;
    this.openRouterCustomModelsList = document.getElementById(
      'openrouter-custom-models-list',
    ) as HTMLDivElement;
    this.openRouterAddModelInput = document.getElementById(
      'openrouter-add-model-input',
    ) as HTMLInputElement;
    this.openRouterRefreshCustomModelsButton = document.getElementById(
      'openrouter-refresh-custom-models-button',
    ) as HTMLButtonElement;
    this.openRouterResetModelsButton = document.getElementById(
      'openrouter-reset-models-button',
    ) as HTMLButtonElement;
    this.openRouterCustomModelsError = document.getElementById(
      'openrouter-custom-models-error',
    ) as HTMLDivElement;
    this.openRouterModelsDatalist = document.getElementById(
      'openrouter-models-datalist',
    ) as HTMLDataListElement;
    this.refreshModelsButton = document.getElementById(
      'refresh-models-button',
    ) as HTMLButtonElement;
    this.refreshModelsButton.innerHTML = ICONS.REFRESH;
    this.confirmOverlay = document.getElementById(
      'confirm-overlay',
    ) as HTMLDivElement;
    this.confirmMessage = document.getElementById(
      'confirm-message',
    ) as HTMLParagraphElement;
    this.confirmOkButton = document.getElementById(
      'confirm-ok-button',
    ) as HTMLButtonElement;
    this.confirmCancelButton = document.getElementById(
      'confirm-cancel-button',
    ) as HTMLButtonElement;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Use event delegation for dynamically created buttons
    document.body.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;

      if (target.id === 'pin-tab-button') {
        if (!this.currentTab) return;
        const isPinned = this.pinnedContexts.some(
          (t) => t.id === this.currentTab!.id,
        );
        if (isPinned) {
          this.unpinTab(this.currentTab.id);
        } else {
          this.pinCurrentTab();
        }
      } else if (target.id === 'toggle-share-button') {
        this.toggleCurrentTabSharing();
      } else if (target.classList.contains('unpin-button')) {
        this.unpinTab(Number(target.dataset.id));
      }
    });

    this.saveSettingsButton.addEventListener('click', () =>
      this.saveSettings(),
    );
    this.cancelSettingsButton.addEventListener('click', () =>
      this.cancelSettings(),
    );

    this.toggleSettingsButton.addEventListener('click', () => {
      if (!this.isSettingsOpen) {
        this.openSettings();
      }
    });

    this.newChatButton.addEventListener('click', async () => {
      this.messagesDiv.innerHTML = ''; // Clear messages in UI
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.CLEAR_CHAT,
      });
      if (response && response.success) {
        this.displayPinnedTabs([]); // Clear pinned tabs in UI
        this.showWelcomeMessage();
      }
    });

    this.providerSelect.addEventListener('change', async () => {
      if (this.providerSelect.value === SidebarController.ADD_PROVIDER_OPTION) {
        // Revert to the actual provider and open the settings instead.
        this.providerSelect.value = this.selectedProvider;
        this.openSettings();
        return;
      }
      if (this.providerSelect.value === Providers.OLLAMA) {
        this.selectedProvider = Providers.OLLAMA;
      } else if (this.providerSelect.value === Providers.OPENROUTER) {
        this.selectedProvider = Providers.OPENROUTER;
      } else {
        this.selectedProvider = Providers.GOOGLE_GEMINI;
      }
      await this.syncStorageService.set(
        StorageKeys.SELECTED_PROVIDER,
        this.selectedProvider,
      );
      await this.populateModelSelect();
    });

    this.modelSelect.addEventListener('change', () => {
      const key = this.getModelStorageKey(this.selectedProvider);
      this.syncStorageService.set(key, this.modelSelect.value);
    });

    this.refreshModelsButton.addEventListener('click', () =>
      this.refreshModels(),
    );

    this.geminiEnabledToggle.addEventListener('change', () =>
      this.updateSettingsControlsState(),
    );
    this.ollamaEnabledToggle.addEventListener('change', () =>
      this.updateSettingsControlsState(),
    );
    this.openRouterEnabledToggle.addEventListener('change', () => {
      this.updateSettingsControlsState();
      if (this.openRouterEnabledToggle.checked) {
        if (this.openRouterApiKeyInput.value.trim() !== '') {
          this.checkOpenRouterKey(this.openRouterApiKeyInput.value);
        }
        if (this.cachedTop5Models.length <= 1) {
          void this.fetchOpenRouterTopModels();
        }
        if (this.cachedAllModels.length === 0) {
          void this.fetchOpenRouterAllModels();
        }
      }
    });

    this.openRouterVerifyButton.addEventListener('click', () =>
      this.checkOpenRouterKey(this.openRouterApiKeyInput.value, true),
    );

    this.openRouterModeTop5.addEventListener('change', () =>
      this.updateOpenRouterModeVisibility(),
    );

    this.openRouterModeCustom.addEventListener('change', () => {
      this.updateOpenRouterModeVisibility();
      if (this.currentOpenRouterModels.length === 0) {
        this.currentOpenRouterModels = [...this.cachedTop5Models];
        this.renderCustomModelsList();
      }
    });

    this.openRouterRefreshTopModelsButton.addEventListener('click', () =>
      this.refreshOpenRouterTopModelsAndCredits(),
    );

    this.openRouterRefreshCustomModelsButton.addEventListener('click', () =>
      this.refreshCustomModelsCatalog(),
    );

    this.openRouterAddModelInput.addEventListener('input', () => {
      const val = this.openRouterAddModelInput.value.trim();
      if (!val) return;
      const isKnownModel =
        this.cachedAllModels.some((m) => m.id === val) ||
        this.cachedTop5Models.some((m) => m.id === val);
      if (isKnownModel) {
        this.addCustomModel(val);
      }
    });

    this.openRouterAddModelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.openRouterAddModelInput.value.trim();
        if (val) {
          this.addCustomModel(val);
        }
      }
    });

    this.openRouterResetModelsButton.addEventListener('click', () =>
      this.resetCustomModels(),
    );

    this.ollamaTestButton.addEventListener('click', () =>
      this.testOllamaConnection(),
    );

    this.ollamaResetButton.addEventListener('click', () =>
      this.resetOllamaDefaults(),
    );

    this.themeSelect.addEventListener('change', () => {
      this.applyTheme(this.themeSelect.value);
    });

    this.promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.isGenerating) {
        this.stopGeneration();
      } else {
        this.sendMessage();
      }
    });

    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isGenerating) {
          this.sendMessage();
        }
      }
    });

    this.messageService.onMessage(
      (
        request: ExtensionMessage,
        _sender: unknown,
        sendResponse: (response?: ExtensionResponse) => void,
      ) => {
        if (request.type === MessageTypes.CURRENT_TAB_INFO) {
          this.updateCurrentTabInfo(request.tab);
          sendResponse({ success: true });
        }
        if (request.type === MessageTypes.CHECK_PINNED_TABS) {
          this.checkPinnedTabs();
          sendResponse({ success: true });
        }
      },
    );
  }

  public async start() {
    // Load API Key, provider settings, and Theme
    const apiKey = await this.syncStorageService.get<string>(
      StorageKeys.API_KEY,
    );
    const geminiEnabled = await this.syncStorageService.get<boolean>(
      StorageKeys.GEMINI_ENABLED,
    );
    const ollamaSettings = toStoredOllamaSettings(
      await this.syncStorageService.get<OllamaSettings>(
        StorageKeys.OLLAMA_SETTINGS,
      ),
    );

    const theme = await this.syncStorageService.get<string>(StorageKeys.THEME);
    const validThemes = Object.values(Themes);
    const effectiveTheme =
      theme && validThemes.includes(theme) ? theme : Themes.SYSTEM;

    this.themeSelect.value = effectiveTheme;
    this.applyTheme(effectiveTheme);

    if (apiKey) {
      this.apiKeyInput.value = apiKey;
    }
    // Existing users predate the toggle: treat "unset" as enabled.
    this.geminiEnabledToggle.checked = geminiEnabled ?? true;
    this.setOllamaFields(ollamaSettings);

    const rawOpenRouter = await this.syncStorageService.get<OpenRouterSettings>(
      StorageKeys.OPENROUTER_SETTINGS,
    );
    const openRouterSettings: OpenRouterSettings = rawOpenRouter
      ? {
          enabled: Boolean(rawOpenRouter.enabled),
          apiKey: String(rawOpenRouter.apiKey ?? ''),
          mode: rawOpenRouter.mode === 'custom' ? 'custom' : 'top5',
          customModels: Array.isArray(rawOpenRouter.customModels)
            ? rawOpenRouter.customModels
            : [...OPENROUTER_FALLBACK_FREE_MODELS],
        }
      : { ...DEFAULT_OPENROUTER_SETTINGS };

    const cachedTop5 = await this.localStorageService.get<
      OpenRouterModelConfig[]
    >(StorageKeys.OPENROUTER_TOP_MODELS_CACHE);
    if (Array.isArray(cachedTop5) && cachedTop5.length > 0) {
      this.cachedTop5Models = cachedTop5;
    }

    const cachedAllModels = await this.localStorageService.get<
      OpenRouterModelConfig[]
    >(StorageKeys.OPENROUTER_ALL_MODELS_CACHE);
    if (Array.isArray(cachedAllModels) && cachedAllModels.length > 0) {
      this.cachedAllModels = cachedAllModels;
      this.populateModelsDatalist(cachedAllModels);
    }

    this.setOpenRouterFields(openRouterSettings);
    this.renderTop5ModelsList(this.cachedTop5Models);
    this.renderCustomModelsList();
    this.updateSettingsControlsState();

    await this.populateProviderSelect();
    // Model population may hit the network (Ollama / OpenRouter); don't block startup —
    // the settings decision, context load, and history rehydrate below must
    // render immediately even when the host is unreachable.
    void this.populateModelSelect().catch((error) =>
      console.error('Failed to populate models:', error),
    );

    const geminiConfigured = this.geminiEnabledToggle.checked && !!apiKey;
    const openRouterConfigured =
      this.openRouterEnabledToggle.checked &&
      !!this.openRouterApiKeyInput.value;
    if (geminiConfigured || ollamaSettings.enabled || openRouterConfigured) {
      this.toggleSettingsView(false);
    } else {
      this.openSettings();
    }

    // Load Sharing Preference
    const storedSharing = await this.localStorageService.get<boolean>(
      StorageKeys.INCLUDE_CURRENT_TAB,
    );
    if (storedSharing !== undefined) {
      this.isCurrentTabShared = storedSharing;
    }

    // Initial context update
    try {
      const response =
        await this.messageService.sendMessage<GetContextResponse>({
          type: MessageTypes.GET_CONTEXT,
        });
      if (response) {
        if (response.pinnedContexts) {
          this.displayPinnedTabs(response.pinnedContexts);
        }
        this.updateCurrentTabInfo(response.tab as TabInfo); // Always update, even if null
      }
    } catch (error) {
      console.error('Failed to get context:', error);
    }

    // Rehydrate History
    await this.loadHistory();
  }

  /**
   * Rebuilds both dropdowns: providers first, then the selected provider's
   * models.
   */
  private async populateProviderAndModels() {
    await this.populateProviderSelect();
    await this.populateModelSelect();
  }

  /**
   * Rebuilds the provider dropdown from the enabled providers, restoring the
   * persisted selection. With exactly one provider enabled, an extra
   * "Add Provider" entry opens the settings.
   */
  private async populateProviderSelect() {
    const geminiOn = this.geminiEnabledToggle.checked;
    const ollamaOn = this.ollamaEnabledToggle.checked;
    const openRouterOn = this.openRouterEnabledToggle.checked;
    this.providerSelect.innerHTML = '';

    const addOption = (value: string, label: string) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.providerSelect.appendChild(option);
    };
    if (geminiOn) {
      addOption(Providers.GOOGLE_GEMINI, 'Google');
    }
    if (ollamaOn) {
      addOption(Providers.OLLAMA, 'Ollama');
    }
    if (openRouterOn) {
      addOption(Providers.OPENROUTER, 'OpenRouter');
    }
    const enabledCount =
      (geminiOn ? 1 : 0) + (ollamaOn ? 1 : 0) + (openRouterOn ? 1 : 0);
    if (enabledCount < 3) {
      addOption(SidebarController.ADD_PROVIDER_OPTION, 'Add Provider…');
    }

    const stored = await this.syncStorageService.get<LLMProvider>(
      StorageKeys.SELECTED_PROVIDER,
    );
    if (stored === Providers.OLLAMA && ollamaOn) {
      this.selectedProvider = Providers.OLLAMA;
    } else if (stored === Providers.OPENROUTER && openRouterOn) {
      this.selectedProvider = Providers.OPENROUTER;
    } else if (stored === Providers.GOOGLE_GEMINI && geminiOn) {
      this.selectedProvider = Providers.GOOGLE_GEMINI;
    } else if (geminiOn) {
      this.selectedProvider = Providers.GOOGLE_GEMINI;
    } else if (ollamaOn) {
      this.selectedProvider = Providers.OLLAMA;
    } else if (openRouterOn) {
      this.selectedProvider = Providers.OPENROUTER;
    }
    this.providerSelect.value = this.selectedProvider;
    if (stored !== this.selectedProvider) {
      await this.syncStorageService.set(
        StorageKeys.SELECTED_PROVIDER,
        this.selectedProvider,
      );
    }
  }

  /**
   * Rebuilds the model dropdown for the selected provider (Ollama / OpenRouter models
   * are fetched, falling back to the cached list) and restores the provider's
   * persisted model.
   */
  private async populateModelSelect() {
    const provider = this.selectedProvider;
    this.modelSelect.innerHTML = '';

    let models: [string, string][];
    let emptyMessage = 'No models available';
    if (provider === Providers.OLLAMA) {
      const result = await this.ollamaModels.fetchModels();
      models = result.models.map((name) => [name, name]);
      // An authoritative empty answer from the server means "nothing
      // installed"; an empty cache fallback means "couldn't reach it".
      emptyMessage = result.fromCache
        ? 'No models found — check Ollama connection'
        : 'No models installed — pull one with `ollama pull`';
    } else if (provider === Providers.OPENROUTER) {
      const isCustom = this.openRouterModeCustom.checked;
      let openRouterModels: OpenRouterModelConfig[];
      if (isCustom) {
        openRouterModels =
          this.currentOpenRouterModels.length > 0
            ? this.currentOpenRouterModels
            : [...OPENROUTER_FALLBACK_FREE_MODELS];
      } else {
        if (this.cachedTop5Models.length <= 1) {
          await this.fetchOpenRouterTopModels();
        }
        openRouterModels =
          this.cachedTop5Models.length > 0
            ? this.cachedTop5Models
            : [...OPENROUTER_FALLBACK_FREE_MODELS];
      }
      models = openRouterModels.map((m) => [m.id, m.name]);
    } else {
      models = Object.entries(SUPPORTED_MODELS) as [string, string][];
    }
    if (models.length === 0) {
      // Show guidance instead of an empty dropdown, and persist nothing.
      const option = document.createElement('option');
      option.value = '';
      option.textContent = emptyMessage;
      option.disabled = true;
      option.selected = true;
      this.modelSelect.appendChild(option);
      this.updateRefreshButtonVisibility();
      return;
    }
    models.forEach(([id, label]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      this.modelSelect.appendChild(option);
    });

    const modelKey = this.getModelStorageKey(provider);
    const storedModel = await this.syncStorageService.get<string>(modelKey);
    const options = Array.from(this.modelSelect.options);
    // Display-only fallback: the stored preference is never overwritten here,
    // so a transiently missing model (e.g. stale cache) is re-selected once
    // it is available again. Only a user's pick (change listener) persists.
    const selected =
      options.find((o) => o.value === storedModel) ??
      (provider === Providers.GOOGLE_GEMINI
        ? options.find((o) => o.value === DEFAULT_MODEL)
        : undefined) ??
      options[0];
    if (selected) {
      this.modelSelect.value = selected.value;
    }
    this.updateRefreshButtonVisibility();
  }

  private getModelStorageKey(provider: LLMProvider): string {
    switch (provider) {
      case Providers.OLLAMA:
        return StorageKeys.OLLAMA_MODEL;
      case Providers.OPENROUTER:
        return StorageKeys.OPENROUTER_MODEL;
      case Providers.GOOGLE_GEMINI:
      default:
        return StorageKeys.GEMINI_MODEL;
    }
  }

  private resetRefreshButton() {
    if (this.refreshTickTimeout) {
      clearTimeout(this.refreshTickTimeout);
      this.refreshTickTimeout = null;
    }
    this.refreshModelsButton.innerHTML = ICONS.REFRESH;
    this.refreshModelsButton.classList.remove('success', 'spinning');
  }

  private updateRefreshButtonVisibility() {
    const isOllama = this.selectedProvider === Providers.OLLAMA;
    const isOpenRouterTop5 =
      this.selectedProvider === Providers.OPENROUTER &&
      this.openRouterModeTop5.checked;
    const isVisible = isOllama || isOpenRouterTop5;
    this.refreshModelsButton.classList.toggle('hidden', !isVisible);
    if (!isVisible) {
      this.resetRefreshButton();
    }
  }

  private async refreshModels() {
    this.resetRefreshButton();
    this.refreshModelsButton.disabled = true;
    this.refreshModelsButton.classList.add('spinning');
    try {
      if (this.selectedProvider === Providers.OPENROUTER) {
        await this.fetchOpenRouterTopModels();
      }
      await this.populateModelSelect();
      this.showRefreshSuccess();
    } finally {
      this.refreshModelsButton.classList.remove('spinning');
      this.refreshModelsButton.disabled = false;
    }
  }

  private showRefreshSuccess() {
    if (this.refreshTickTimeout) {
      clearTimeout(this.refreshTickTimeout);
      this.refreshTickTimeout = null;
    }
    this.refreshModelsButton.innerHTML = ICONS.CHECK;
    this.refreshModelsButton.classList.add('success');
    this.refreshTickTimeout = setTimeout(() => {
      this.refreshModelsButton.innerHTML = ICONS.REFRESH;
      this.refreshModelsButton.classList.remove('success');
      this.refreshTickTimeout = null;
    }, 1500);
  }

  private openSettings() {
    this.clearError();
    this.initialTheme = this.themeSelect.value;
    this.initialApiKey = this.apiKeyInput.value;
    this.initialGeminiEnabled = this.geminiEnabledToggle.checked;
    this.initialOllamaSettings = this.getOllamaFieldsFromUI();
    this.initialOpenRouterSettings = this.getOpenRouterFieldsFromUI();
    this.isSettingsOpen = true;
    this.toggleSettingsView(true);
    this.apiKeyInput.focus();
    // Detect a local Ollama regardless of the toggle state (status line only;
    // the model cache is owned by fetchOllamaModels).
    this.pingOllama(this.ollamaHostInput.value);
    if (this.openRouterEnabledToggle.checked) {
      if (this.openRouterApiKeyInput.value.trim() !== '') {
        this.checkOpenRouterKey(this.openRouterApiKeyInput.value);
      }
      if (this.cachedTop5Models.length <= 1) {
        void this.fetchOpenRouterTopModels();
      }
      if (this.cachedAllModels.length === 0) {
        void this.fetchOpenRouterAllModels();
      }
    }
  }

  private async saveSettings() {
    this.clearError();
    const geminiOn = this.geminiEnabledToggle.checked;
    const ollamaOn = this.ollamaEnabledToggle.checked;
    const openRouterOn = this.openRouterEnabledToggle.checked;

    // The Save button is disabled in this state; this is a safety net.
    if (!geminiOn && !ollamaOn && !openRouterOn) {
      this.showError('Enable at least one provider to save.');
      return;
    }

    // Only enabled providers are validated; disabled providers' fields are
    // saved verbatim (they cannot be used until enabled and fixed).
    if (geminiOn && this.apiKeyInput.value.trim() === '') {
      this.showError('Please enter your Gemini API Key.', this.apiKeyInput);
      return;
    }
    if (openRouterOn) {
      if (this.openRouterApiKeyInput.value.trim() === '') {
        this.showError(
          'Please enter your OpenRouter API Key.',
          this.openRouterApiKeyInput,
        );
        return;
      }
      if (
        this.openRouterModeCustom.checked &&
        this.currentOpenRouterModels.length === 0
      ) {
        const errorMsg =
          'Please add at least one model to your custom model list.';
        if (this.openRouterCustomModelsError) {
          this.openRouterCustomModelsError.textContent = errorMsg;
          this.openRouterCustomModelsError.classList.remove('hidden');
          if (
            typeof this.openRouterCustomModelsError.scrollIntoView ===
            'function'
          ) {
            this.openRouterCustomModelsError.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }
        this.showError(errorMsg, this.openRouterAddModelInput);
        return;
      }
    }
    if (ollamaOn) {
      const host = this.ollamaHostInput.value.trim();
      if (host !== '' && !normalizeOllamaHost(host)) {
        this.showError(
          'Please enter a valid Ollama host URL.',
          this.ollamaHostInput,
        );
        return;
      }
      const numCtx = this.ollamaNumCtxInput.value.trim();
      if (numCtx !== '' && !/^\d+$/.test(numCtx)) {
        this.showError(
          'num_ctx must be a positive whole number.',
          this.ollamaNumCtxInput,
        );
        return;
      }
    }

    try {
      await this.syncStorageService.set(
        StorageKeys.API_KEY,
        this.apiKeyInput.value,
      );
      await this.syncStorageService.set(StorageKeys.GEMINI_ENABLED, geminiOn);
      await this.syncStorageService.set(
        StorageKeys.OLLAMA_SETTINGS,
        this.getOllamaFieldsFromUI(),
      );
      await this.syncStorageService.set(
        StorageKeys.OPENROUTER_SETTINGS,
        this.getOpenRouterFieldsFromUI(),
      );
      await this.syncStorageService.set(
        StorageKeys.THEME,
        this.themeSelect.value,
      );
      await this.populateProviderAndModels();
      this.isSettingsOpen = false;
      this.toggleSettingsView(false);
      this.toggleSettingsButton.focus();
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings.');
    }
  }

  private cancelSettings() {
    this.clearError();
    this.applyTheme(this.initialTheme);
    this.themeSelect.value = this.initialTheme;
    this.apiKeyInput.value = this.initialApiKey;
    this.geminiEnabledToggle.checked = this.initialGeminiEnabled;
    this.setOllamaFields(this.initialOllamaSettings);
    this.setOpenRouterFields(this.initialOpenRouterSettings);
    this.updateSettingsControlsState();
    this.isSettingsOpen = false;
    this.toggleSettingsView(false);
    this.toggleSettingsButton.focus();
  }

  private getOllamaFieldsFromUI(): OllamaSettings {
    return {
      enabled: this.ollamaEnabledToggle.checked,
      host: this.ollamaHostInput.value,
      numCtx: this.ollamaNumCtxInput.value,
      keepAlive: this.ollamaKeepAliveInput.value,
    };
  }

  private setOllamaFields(settings: OllamaSettings) {
    this.ollamaEnabledToggle.checked = settings.enabled;
    this.ollamaHostInput.value = settings.host;
    this.ollamaNumCtxInput.value = settings.numCtx;
    this.ollamaKeepAliveInput.value = settings.keepAlive;
  }

  private setOpenRouterFields(settings: OpenRouterSettings) {
    this.openRouterEnabledToggle.checked = settings.enabled;
    this.openRouterApiKeyInput.value = settings.apiKey;
    if (settings.mode === 'custom') {
      this.openRouterModeCustom.checked = true;
    } else {
      this.openRouterModeTop5.checked = true;
    }
    this.currentOpenRouterModels = Array.isArray(settings.customModels)
      ? [...settings.customModels]
      : [...OPENROUTER_FALLBACK_FREE_MODELS];
    this.renderCustomModelsList();
    this.updateOpenRouterModeVisibility();
  }

  private getOpenRouterFieldsFromUI(): OpenRouterSettings {
    return {
      enabled: this.openRouterEnabledToggle.checked,
      apiKey: this.openRouterApiKeyInput.value,
      mode: this.openRouterModeCustom.checked ? 'custom' : 'top5',
      customModels: [...this.currentOpenRouterModels],
    };
  }

  private updateOpenRouterModeVisibility() {
    const isCustom = this.openRouterModeCustom.checked;
    this.openRouterTop5Container.classList.toggle('hidden', isCustom);
    this.openRouterCustomContainer.classList.toggle('hidden', !isCustom);
    this.updateRefreshButtonVisibility();
  }

  private renderTop5ModelsList(models: OpenRouterModelConfig[]) {
    this.openRouterTop5ModelsList.innerHTML = '';
    models.forEach((model) => {
      const item = document.createElement('div');
      item.className = 'openrouter-model-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'model-name';
      const ctx = formatContextLength(model.contextLength);
      const label = model.name || model.id;
      nameSpan.textContent = ctx ? `${label} (${ctx})` : label;
      nameSpan.title = model.id;
      item.appendChild(nameSpan);

      this.openRouterTop5ModelsList.appendChild(item);
    });
  }

  private renderCustomModelsList() {
    this.openRouterCustomModelsList.innerHTML = '';
    if (this.currentOpenRouterModels.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'openrouter-empty-list-message';
      emptyMsg.textContent =
        'No models configured. Please add at least one model.';
      this.openRouterCustomModelsList.appendChild(emptyMsg);
      return;
    }

    this.currentOpenRouterModels.forEach((model, index) => {
      const item = document.createElement('div');
      item.className = 'openrouter-model-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'model-name';
      const contextLength =
        model.contextLength ??
        this.cachedTop5Models.find((m) => m.id === model.id)?.contextLength ??
        this.cachedAllModels.find((m) => m.id === model.id)?.contextLength;
      const ctx = formatContextLength(contextLength);
      const label = model.name || model.id;
      nameSpan.textContent = ctx ? `${label} (${ctx})` : label;
      nameSpan.title = model.id;
      item.appendChild(nameSpan);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'openrouter-model-remove-btn';
      removeBtn.innerHTML = ICONS.CLOSE;
      removeBtn.title = 'Remove model';
      removeBtn.addEventListener('click', () => {
        this.currentOpenRouterModels.splice(index, 1);
        this.renderCustomModelsList();
      });
      item.appendChild(removeBtn);

      this.openRouterCustomModelsList.appendChild(item);
    });
  }

  private addCustomModel(modelId?: string) {
    const val = (modelId ?? this.openRouterAddModelInput.value).trim();
    if (!val) return;
    const found =
      this.cachedAllModels.find((m) => m.id === val) ||
      this.cachedTop5Models.find((m) => m.id === val);
    // Only allow adding models that exist in the known/fetched model list
    if (!found) return;

    if (!this.currentOpenRouterModels.some((m) => m.id === found.id)) {
      this.currentOpenRouterModels.push({
        id: found.id,
        name: found.name || found.id,
        isFree: found.isFree,
        contextLength: found.contextLength,
      });
      this.renderCustomModelsList();
      if (this.openRouterCustomModelsError) {
        this.openRouterCustomModelsError.textContent = '';
        this.openRouterCustomModelsError.classList.add('hidden');
      }
    }
    this.openRouterAddModelInput.value = '';
  }

  private async refreshCustomModelsCatalog() {
    this.openRouterRefreshCustomModelsButton.disabled = true;
    const originalText =
      this.openRouterRefreshCustomModelsButton.textContent?.trim() ||
      'Refresh Models';
    this.openRouterRefreshCustomModelsButton.textContent = 'Refreshing...';

    try {
      await this.fetchOpenRouterAllModels();
    } finally {
      this.openRouterRefreshCustomModelsButton.textContent = originalText;
      this.openRouterRefreshCustomModelsButton.disabled = false;
    }
  }

  private populateModelsDatalist(models: OpenRouterModelConfig[]) {
    if (!this.openRouterModelsDatalist) return;
    this.openRouterModelsDatalist.innerHTML = '';
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      const ctx = formatContextLength(model.contextLength);
      const ctxStr = ctx ? ` (${ctx})` : '';
      option.textContent =
        model.name && model.name !== model.id
          ? `${model.name}${ctxStr} (${model.id})`
          : `${model.id}${ctxStr}`;
      this.openRouterModelsDatalist.appendChild(option);
    });
  }

  private async fetchOpenRouterAllModels(): Promise<OpenRouterModelConfig[]> {
    try {
      const response =
        await this.messageService.sendMessage<OpenRouterListModelsResponse>({
          type: MessageTypes.OPENROUTER_LIST_ALL_MODELS,
        });
      if (
        response &&
        response.success &&
        Array.isArray(response.models) &&
        response.models.length > 0
      ) {
        this.cachedAllModels = response.models;
        await this.localStorageService.set(
          StorageKeys.OPENROUTER_ALL_MODELS_CACHE,
          response.models,
        );
        this.populateModelsDatalist(this.cachedAllModels);
        return response.models;
      }
    } catch (error) {
      console.error('Failed to fetch OpenRouter all models:', error);
    }
    return this.cachedAllModels;
  }

  private async resetCustomModels() {
    if (
      !(await this.showConfirm(
        'Reset configured models to the Top 5 free models?',
      ))
    ) {
      return;
    }
    await this.fetchOpenRouterTopModels();
    this.currentOpenRouterModels = [...this.cachedTop5Models];
    this.renderCustomModelsList();
    if (this.openRouterCustomModelsError) {
      this.openRouterCustomModelsError.textContent = '';
      this.openRouterCustomModelsError.classList.add('hidden');
    }
  }

  private async checkOpenRouterKey(apiKey: string, isManualVerify = false) {
    const key = apiKey.trim();
    if (!key) return;
    if (isManualVerify) {
      this.openRouterVerifyButton.disabled = true;
    }
    this.openRouterStatus.classList.remove('hidden', 'success', 'error');
    this.openRouterStatus.textContent = 'Checking key...';

    try {
      const response =
        await this.messageService.sendMessage<OpenRouterVerifyKeyResponse>({
          type: MessageTypes.OPENROUTER_VERIFY_KEY,
          apiKey: key,
        });
      if (response && response.success) {
        const balanceStr =
          typeof response.balance === 'number'
            ? `$${response.balance.toFixed(2)}`
            : '$0.00';
        const tierStr = response.isFreeTier ? ' (Free tier)' : '';
        this.openRouterStatus.textContent = `● Key valid · Balance: ${balanceStr}${tierStr}`;
        this.openRouterStatus.classList.add('success');
        this.openRouterStatus.classList.remove('error');
      } else {
        this.openRouterStatus.textContent = `● ${response?.error || 'Invalid API key'}`;
        this.openRouterStatus.classList.add('error');
        this.openRouterStatus.classList.remove('success');
      }
    } catch (error) {
      console.error('Failed to verify OpenRouter key:', error);
      this.openRouterStatus.textContent = '● Failed to connect to OpenRouter';
      this.openRouterStatus.classList.add('error');
      this.openRouterStatus.classList.remove('success');
    } finally {
      this.openRouterStatus.classList.remove('hidden');
      if (isManualVerify) {
        this.openRouterVerifyButton.disabled = false;
      }
    }
  }

  private async fetchOpenRouterTopModels(): Promise<OpenRouterModelConfig[]> {
    try {
      const response =
        await this.messageService.sendMessage<OpenRouterListModelsResponse>({
          type: MessageTypes.OPENROUTER_LIST_MODELS,
        });
      if (
        response &&
        response.success &&
        Array.isArray(response.models) &&
        response.models.length > 0
      ) {
        this.cachedTop5Models = response.models;
        await this.localStorageService.set(
          StorageKeys.OPENROUTER_TOP_MODELS_CACHE,
          response.models,
        );
        this.renderTop5ModelsList(this.cachedTop5Models);
        return response.models;
      }
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
    }
    return this.cachedTop5Models;
  }

  private async refreshOpenRouterTopModelsAndCredits() {
    this.openRouterRefreshTopModelsButton.disabled = true;
    const originalText =
      this.openRouterRefreshTopModelsButton.textContent?.trim() ||
      'Refresh Models';
    this.openRouterRefreshTopModelsButton.textContent = 'Refreshing...';
    try {
      await this.fetchOpenRouterTopModels();
      void this.fetchOpenRouterAllModels();
      if (this.openRouterApiKeyInput.value.trim() !== '') {
        await this.checkOpenRouterKey(this.openRouterApiKeyInput.value);
      }
    } finally {
      this.openRouterRefreshTopModelsButton.textContent = originalText;
      this.openRouterRefreshTopModelsButton.disabled = false;
    }
  }

  /**
   * Collapses/expands the provider panel bodies to match their toggles and
   * keeps the Save button disabled while no provider is enabled.
   */
  private updateSettingsControlsState() {
    this.geminiPanelBody.classList.toggle(
      'hidden',
      !this.geminiEnabledToggle.checked,
    );
    this.ollamaPanelBody.classList.toggle(
      'hidden',
      !this.ollamaEnabledToggle.checked,
    );
    this.openRouterPanelBody.classList.toggle(
      'hidden',
      !this.openRouterEnabledToggle.checked,
    );
    this.saveSettingsButton.disabled =
      !this.geminiEnabledToggle.checked &&
      !this.ollamaEnabledToggle.checked &&
      !this.openRouterEnabledToggle.checked;
  }

  /**
   * Shows the in-page confirmation dialog (window.confirm is not available
   * in Chrome extension pages such as the side panel).
   */
  private showConfirm(message: string): Promise<boolean> {
    this.confirmMessage.textContent = message;
    this.confirmOverlay.classList.remove('hidden');
    return new Promise((resolve) => {
      const finish = (result: boolean) => {
        this.confirmOverlay.classList.add('hidden');
        this.confirmOkButton.removeEventListener('click', onOk);
        this.confirmCancelButton.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      this.confirmOkButton.addEventListener('click', onOk);
      this.confirmCancelButton.addEventListener('click', onCancel);
    });
  }

  private async resetOllamaDefaults() {
    if (!(await this.showConfirm('Reset Ollama settings to defaults?'))) {
      return;
    }
    this.setOllamaFields({
      ...DEFAULT_OLLAMA_SETTINGS,
      enabled: this.ollamaEnabledToggle.checked,
    });
  }

  /**
   * Pings the given (possibly unsaved) host and reflects the result in the
   * status line. Purely a status check: the model cache is written only by
   * fetchOllamaModels, so pinging can never pollute the fallback model list.
   */
  private async pingOllama(host: string) {
    this.ollamaTestButton.disabled = true;
    try {
      const response =
        await this.messageService.sendMessage<OllamaModelsResponse>({
          type: MessageTypes.OLLAMA_TEST_CONNECTION,
          host: host,
        });
      if (response && response.success && Array.isArray(response.models)) {
        const count = response.models.length;
        this.ollamaStatus.textContent = `● Ollama is online (${count} model${count === 1 ? '' : 's'})`;
        this.ollamaStatus.classList.add('success');
        this.ollamaStatus.classList.remove('error');
      } else {
        this.ollamaStatus.textContent = '● Ollama not found';
        this.ollamaStatus.classList.add('error');
        this.ollamaStatus.classList.remove('success');
      }
    } catch (error) {
      console.error('Failed to reach Ollama:', error);
      this.ollamaStatus.textContent = '● Ollama not found';
      this.ollamaStatus.classList.add('error');
      this.ollamaStatus.classList.remove('success');
    } finally {
      this.ollamaStatus.classList.remove('hidden');
      this.ollamaTestButton.disabled = false;
    }
  }

  private async testOllamaConnection() {
    await this.pingOllama(this.ollamaHostInput.value);
  }

  private showError(message: string, errorElement?: HTMLElement) {
    this.settingsError.textContent = message;
    this.settingsError.classList.remove('hidden');
    if (errorElement) {
      // The offending field may sit inside a collapsed section (e.g. Ollama
      // advanced settings); expand it so the highlight is actually visible.
      const details = errorElement.closest('details');
      if (details) {
        details.open = true;
      }
      errorElement.classList.add('input-error');
      errorElement.focus();
      if (typeof errorElement.scrollIntoView === 'function') {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  private clearError() {
    this.settingsError.textContent = '';
    this.settingsError.classList.add('hidden');
    if (this.openRouterCustomModelsError) {
      this.openRouterCustomModelsError.textContent = '';
      this.openRouterCustomModelsError.classList.add('hidden');
    }
    this.settingsView.querySelectorAll('.input-error').forEach((el) => {
      el.classList.remove('input-error');
    });
  }

  // The whole bottom panel (current tab, provider/model controls, prompt
  // form) is hidden with the chat: none of it is usable mid-settings, and a
  // still-interactive provider dropdown could re-open the settings and
  // re-snapshot half-edited values as the "initial" state Cancel restores.
  private toggleSettingsView(show: boolean) {
    if (show) {
      this.settingsView.classList.remove('hidden');
      this.messagesDiv.classList.add('hidden');
      this.bottomPanel.classList.add('hidden');
    } else {
      this.settingsView.classList.add('hidden');
      this.messagesDiv.classList.remove('hidden');
      this.bottomPanel.classList.remove('hidden');
    }
  }

  private applyTheme(theme: string) {
    if (theme === Themes.SYSTEM) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  private async loadHistory() {
    try {
      const response =
        await this.messageService.sendMessage<GetHistoryResponse>({
          type: MessageTypes.GET_HISTORY,
        });
      if (response && response.success && response.history) {
        if (response.history.length === 0) {
          this.showWelcomeMessage();
          return;
        }
        for (const msg of response.history) {
          await this.appendMessage(msg.role, msg.text);
        }
      } else {
        this.showWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      this.appendMessage(
        'system',
        'System: Failed to load chat history. Try starting a new chat.',
      );
    }
  }

  private showWelcomeMessage() {
    this.messagesDiv.innerHTML = `
      <div class="welcome-container">
        <div class="welcome-header">
          <h1>Welcome to LLM Sidebar with Context</h1>
        </div>

        <div class="welcome-section">
          <h2>Quick Tips</h2>
          <ul>
            <li><strong>Select Model:</strong> Choose the best model for your task.</li>
            <li><strong>Pin Tabs:</strong> Click the ${ICONS.PIN} icon to pin the current tab as context. You can pin multiple tabs.</li>
            <li><strong>Control Privacy:</strong> Click the ${ICONS.EYE} icon to toggle auto-sharing of your current tab.</li>
          </ul>
        </div>

        <div class="welcome-section">
          <h2>Try asking</h2>
          <ul>
            <li>"Summarize news from multiple tabs"</li>
            <li>"Explain this code snippet"</li>
            <li>"Review my doc"</li>
          </ul>
        </div>
      </div>
    `;
  }

  private async sendMessage() {
    const message = this.promptInput.value;
    if (message.trim() === '' || this.isGenerating) return;

    // Remove welcome message if it exists
    const welcome = this.messagesDiv.querySelector('.welcome-container');
    if (welcome) {
      this.messagesDiv.innerHTML = '';
    }

    this.isGenerating = true;
    this.submitButton.innerHTML = ICONS.STOP;
    this.submitButton.title = 'Stop generation';

    this.appendMessage('user', message);
    this.promptInput.value = '';

    const thinkingMessageElement = this.appendThinkingMessage();
    const thinkingStatusElement = thinkingMessageElement.querySelector(
      '.thinking-status',
    ) as HTMLSpanElement;
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      thinkingStatusElement.textContent = `Waiting for model response... (${elapsed.toFixed(1)}s)`;
    }, 100);

    try {
      const response = await this.messageService.sendMessage<LLMResponse>({
        type: MessageTypes.CHAT_MESSAGE,
        message: message,
        model: this.modelSelect.value,
        includeCurrentTab: this.isCurrentTabShared,
        provider: this.selectedProvider,
      });

      clearInterval(timerInterval);
      thinkingMessageElement.remove();
      const duration = (Date.now() - startTime) / 1000;

      if (
        response &&
        (response.aborted ||
          (response.error && response.error.toLowerCase().includes('aborted')))
      ) {
        // Restore message to input if aborted
        this.promptInput.value = message;
        // Remove the user message from UI as well to match history
        const lastMessage = this.messagesDiv.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('user')) {
          lastMessage.remove();
        }
        // If we removed the only message, show welcome back
        if (this.messagesDiv.children.length === 0) {
          this.showWelcomeMessage();
        }
      } else if (response && response.reply) {
        this.appendMessage('model', response.reply, duration);
      } else if (response && response.error) {
        this.appendMessage('error', `Error: ${response.error}`);
      } else {
        // Never fail silently (e.g. an unexpected empty reply).
        this.appendMessage('error', 'Error: No response received.');
      }
    } catch (error: unknown) {
      clearInterval(timerInterval);
      thinkingMessageElement.remove();
      const err = error as Error;
      if (
        err.message &&
        err.message.includes('Extension context invalidated.')
      ) {
        this.appendMessage(
          'system',
          'System: Extension updated. Reloading to reconnect...',
        );
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.appendMessage('error', `Error: ${error}`);
      }
    } finally {
      this.isGenerating = false;
      this.submitButton.innerHTML = ICONS.SEND;
      this.submitButton.title = 'Send prompt';
    }
  }

  private async stopGeneration() {
    try {
      await this.messageService.sendMessage({
        type: MessageTypes.STOP_GENERATION,
      });
    } catch (error) {
      console.error('Failed to stop generation:', error);
    }
  }

  private getRandomTip(): string {
    const tips =
      this.selectedProvider === Providers.OLLAMA
        ? [...GENERAL_TIPS, ...OLLAMA_TIPS]
        : GENERAL_TIPS;
    return tips[Math.floor(Math.random() * tips.length)];
  }

  private appendThinkingMessage(): HTMLDivElement {
    const thinkingMessageElement = document.createElement('div');
    thinkingMessageElement.classList.add('message', 'thinking');

    const statusSpan = document.createElement('span');
    statusSpan.className = 'thinking-status';
    statusSpan.textContent = 'Waiting for model response... (0.0s)';
    thinkingMessageElement.appendChild(statusSpan);

    const tipDiv = document.createElement('div');
    tipDiv.className = 'thinking-tip';
    // Tip strings are static, developer-authored content (see constants.ts),
    // never user input, so innerHTML here carries no injection risk.
    tipDiv.innerHTML = `TIP: ${this.getRandomTip()}`;
    thinkingMessageElement.appendChild(tipDiv);

    this.messagesDiv.appendChild(thinkingMessageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
    return thinkingMessageElement;
  }

  private async appendMessage(sender: string, text: string, duration?: number) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    if (sender === 'model') {
      messageElement.innerHTML = await marked.parse(text);

      const footer = document.createElement('div');
      footer.className = 'message-footer';

      if (typeof duration === 'number') {
        const durationSpan = document.createElement('span');
        durationSpan.className = 'response-duration';
        durationSpan.textContent = `${duration.toFixed(1)}s`;
        footer.appendChild(durationSpan);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-button';
      copyBtn.title = 'Copy markdown to clipboard';
      copyBtn.innerHTML = ICONS.COPY;
      copyBtn.onclick = () => this.copyToClipboard(text, copyBtn);
      footer.appendChild(copyBtn);

      messageElement.appendChild(footer);
    } else {
      messageElement.textContent = text;
    }
    this.messagesDiv.appendChild(messageElement);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
  }

  private async copyToClipboard(text: string, button: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(text);
      button.innerHTML = `${ICONS.CHECK}<span>Copied markdown to clipboard</span>`;
      button.classList.add('success');
      button.title = 'Copied markdown to clipboard';
      setTimeout(() => {
        button.innerHTML = ICONS.COPY;
        button.classList.remove('success');
        button.title = 'Copy markdown to clipboard';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  }

  private async pinCurrentTab() {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.PIN_TAB,
      });
      if (response && response.success) {
        this.checkPinnedTabs();
      } else if (response && response.message) {
        this.appendMessage('system', `System: ${response.message}`);
      }
    } catch (error) {
      console.error('Failed to pin tab:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.appendMessage('system', `System: ${errorMessage}`);
    }
  }

  private async unpinTab(tabId: number) {
    try {
      const response = await this.messageService.sendMessage<SuccessResponse>({
        type: MessageTypes.UNPIN_TAB,
        tabId: tabId,
      });
      if (response && response.success) {
        this.checkPinnedTabs();
      }
    } catch (error) {
      console.error('Failed to unpin tab:', error);
    }
  }

  private displayPinnedTabs(pinnedContexts: TabInfo[]) {
    this.pinnedContexts = pinnedContexts || [];
    this.pinnedTabsDiv.innerHTML = '';

    // Refresh current tab icon as its state might change based on pinned list
    if (this.currentTab) {
      this.updateCurrentTabInfo(this.currentTab);
    }

    if (!this.pinnedContexts || this.pinnedContexts.length === 0) {
      return;
    }
    const ul = document.createElement('ul');
    this.pinnedContexts.forEach((context) => {
      const li = document.createElement('li');
      const faviconHtml = context.favIconUrl
        ? `<img src="${context.favIconUrl}" class="favicon" alt="${context.title}" />`
        : '';
      const buttons = `
        <button class="icon-button unpin-button" data-id="${context.id}" title="Unpin this tab">
          ${ICONS.CLOSE}
        </button>`;
      li.innerHTML = `${faviconHtml}<span>${context.title}</span>${buttons}`;
      ul.appendChild(li);
    });
    this.pinnedTabsDiv.appendChild(ul);
  }

  private async checkPinnedTabs() {
    try {
      const response =
        await this.messageService.sendMessage<CheckPinnedTabsResponse>({
          type: MessageTypes.CHECK_PINNED_TABS,
        });
      if (response && response.success) {
        this.displayPinnedTabs(response.pinnedContexts);
      }
    } catch (error) {
      console.error('Failed to check pinned tabs:', error);
    }
  }

  private async toggleCurrentTabSharing() {
    this.isCurrentTabShared = !this.isCurrentTabShared;
    await this.localStorageService.set(
      StorageKeys.INCLUDE_CURRENT_TAB,
      this.isCurrentTabShared,
    );
    if (this.currentTab) {
      this.updateCurrentTabInfo(this.currentTab);
    }
  }

  private updateCurrentTabInfo(tab: TabInfo) {
    this.currentTab = tab;

    if (!tab) {
      this.currentTabDiv.innerHTML =
        '<span>Current: No active tab found.</span>';
      return;
    }

    const isPinned = this.pinnedContexts.some((t) => t.id === tab.id);
    const isRestricted = RestrictedURLs.some((url) => tab.url.startsWith(url));

    let pinButtonHtml = '';
    if (isRestricted) {
      // Restricted Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button restricted" title="Can't pin restricted tab: ${tab.url}" disabled>
          ${ICONS.RESTRICTED}
        </button>`;
    } else if (isPinned) {
      // Pinned Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button pinned" title="Click to unpin current tab">
          ${ICONS.PINNED}
        </button>`;
    } else {
      // Pinnable Icon
      pinButtonHtml = `
        <button id="pin-tab-button" class="icon-button pinnable" title="Click to pin current tab">
          ${ICONS.PIN}
        </button>`;
    }

    const eyeIcon = this.isCurrentTabShared ? ICONS.EYE : ICONS.EYE_OFF;

    const shareButtonHtml = `
      <button id="toggle-share-button" class="icon-button ${this.isCurrentTabShared ? 'active' : ''}" title="${this.isCurrentTabShared ? 'Current tab is being shared. Click to stop sharing current tab' : 'Current tab is NOT being shared. Click to start sharing.'}">
        ${eyeIcon}
      </button>
    `;

    const faviconHtml = tab.favIconUrl
      ? `<img src="${tab.favIconUrl}" class="favicon" alt="${tab.title}" />`
      : '';

    this.currentTabDiv.innerHTML = `${shareButtonHtml}${faviconHtml}<span>Current: ${tab.title}</span>${pinButtonHtml}`;
  }
}
