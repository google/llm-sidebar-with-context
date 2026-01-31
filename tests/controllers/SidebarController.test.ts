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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidebarController } from "../../src/scripts/controllers/SidebarController";
import { ISyncStorageService } from "../../src/scripts/services/storageService";
import { IMessageService } from "../../src/scripts/services/messageService";
import { MessageTypes, StorageKeys } from "../../src/scripts/constants";
import fs from "fs";
import path from "path";

// Mock marked to avoid issues in Node environment
vi.mock("marked", () => ({
  marked: {
    parse: vi.fn((text) => Promise.resolve(`<p>${text}</p>`)),
  },
}));

const htmlContent = fs.readFileSync(
  path.resolve(__dirname, "../../src/pages/sidebar.html"),
  "utf8"
);

describe("SidebarController", () => {
  let controller: SidebarController;
  let mockSyncStorage: ISyncStorageService;
  let mockMessageService: IMessageService;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = htmlContent;
    
    mockSyncStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
    mockMessageService = {
      sendMessage: vi.fn().mockResolvedValue({}),
      onMessage: vi.fn(),
    };
    
    controller = new SidebarController(mockSyncStorage, mockMessageService);
  });

  describe("Initialization", () => {
    it("should hide API key container if key exists in storage", async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.API_KEY) return "fake-api-key";
        return undefined;
      });
      
      await controller.start();

      const container = document.getElementById("api-key-container");
      expect(container?.style.display).toBe("none");
    });

    it("should show API key container if key is missing", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined); 
      
      await controller.start();

      const container = document.getElementById("api-key-container");
      expect(container?.style.display).toBe("flex");
    });

    it("should load selected model from storage", async () => {
      vi.mocked(mockSyncStorage.get).mockImplementation(async (key) => {
        if (key === StorageKeys.SELECTED_MODEL) return "gemini-2.5-pro";
        return undefined;
      });

      await controller.start();

      const select = document.getElementById("model-select") as HTMLSelectElement;
      expect(select.value).toBe("gemini-2.5-pro");
    });

    it("should use default model if none is found in storage", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue(undefined);

      await controller.start();

      const select = document.getElementById("model-select") as HTMLSelectElement;
      expect(select.value).toBe("gemini-2.5-flash");
    });
  });

  describe("API Key Management", () => {
    it("should toggle API key visibility when 'Key' button is clicked", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue("fake-key");
      await controller.start();
      
      const container = document.getElementById("api-key-container") as HTMLElement;
      const keyButton = document.getElementById("edit-api-key-button") as HTMLButtonElement;
      
      expect(container.style.display).toBe("none");
      keyButton.click();
      expect(container.style.display).toBe("flex");
      keyButton.click();
      expect(container.style.display).toBe("none");
    });

    it("should populate the API key input with the stored key when loaded", async () => {
      vi.mocked(mockSyncStorage.get).mockResolvedValue("existing-secret-key");
      await controller.start();

      const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
      expect(apiKeyInput.value).toBe("existing-secret-key");
    });

    it("should show alert and not send message when attempting to save an empty API key", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
      const saveButton = document.getElementById("save-api-key-button") as HTMLButtonElement;

      apiKeyInput.value = "   "; 
      saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith("Please enter your Gemini API Key.");
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it("should show alert if API key saving fails", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
      const saveButton = document.getElementById("save-api-key-button") as HTMLButtonElement;

      apiKeyInput.value = "new-key";
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({ success: false });

      await saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith("Failed to save API Key.");
      alertSpy.mockRestore();
    });

    it("should show alert if API key saving throws error", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
      const saveButton = document.getElementById("save-api-key-button") as HTMLButtonElement;

      apiKeyInput.value = "new-key";
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(new Error("Network error"));

      await saveButton.click();

      expect(alertSpy).toHaveBeenCalledWith("Failed to save API Key.");
      alertSpy.mockRestore();
    });
  });

  describe("Tab Context Updates", () => {
    let messageListener: any;

    beforeEach(() => {
      vi.mocked(mockMessageService.onMessage).mockImplementation((listener) => {
        messageListener = listener;
      });
      controller = new SidebarController(mockSyncStorage, mockMessageService);
    });

    it("should update current tab info when receiving a message", () => {
      messageListener({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 1, title: "First Page", url: "https://a.com" },
      }, {}, vi.fn());

      const div = document.getElementById("current-tab");
      expect(div?.textContent).toContain("First Page");
    });

    it("should update title correctly when switching tabs", () => {
      const div = document.getElementById("current-tab");

      messageListener({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 1, title: "Tab 1", url: "https://1.com" },
      }, {}, vi.fn());
      expect(div?.textContent).toContain("Tab 1");

      messageListener({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 2, title: "Tab 2", url: "https://2.com" },
      }, {}, vi.fn());
      expect(div?.textContent).toContain("Tab 2");
      expect(div?.textContent).not.toContain("Tab 1");
    });

    it("should handle delayed title updates (loading -> complete)", () => {
      const div = document.getElementById("current-tab");

      messageListener({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 1, title: "https://google.com", url: "https://google.com" },
      }, {}, vi.fn());
      expect(div?.textContent).toContain("https://google.com");

      messageListener({
        type: MessageTypes.CURRENT_TAB_INFO,
        tab: { id: 1, title: "Google Search", url: "https://google.com" },
      }, {}, vi.fn());
      
      expect(div?.textContent).toContain("Google Search");
      expect(div?.textContent).not.toContain("https://google.comGoogle Search"); 
    });
  });

  describe("Pinned Tabs", () => {
    it("should display pinned tabs from background", async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_CONTEXT) {
          return { pinnedContexts: [{ id: 101, title: "Pinned 1", url: "https://p1.com" }] };
        }
        if (msg.type === MessageTypes.CHECK_PINNED_TABS) {
          return { success: true, pinnedContexts: [{ id: 101, title: "Pinned 1", url: "https://p1.com" }] };
        }
        return {};
      });

      await controller.start();

      const pinnedDiv = document.getElementById("pinned-tabs");
      expect(pinnedDiv?.textContent).toContain("Pinned 1");
    });

    it("should unpin a tab when x button is clicked", async () => {
        vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
            if (msg.type === MessageTypes.GET_CONTEXT) {
              return { pinnedContexts: [{ id: 101, title: "Pinned 1", url: "https://p1.com" }] };
            }
            if (msg.type === MessageTypes.CHECK_PINNED_TABS) {
                return { success: true, pinnedContexts: [{ id: 101, title: "Pinned 1", url: "https://p1.com" }] };
            }
            return { success: true };
        });

        await controller.start();

        const unpinButton = document.querySelector(".unpin-button") as HTMLButtonElement;
        expect(unpinButton.dataset.id).toBe("101");

        unpinButton.click();

        expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
            type: MessageTypes.UNPIN_TAB,
            tabId: 101
        });
    });
  });

  describe("Chat Interaction", () => {
    it("should send message and display response", async () => {
      const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
      const promptForm = document.getElementById("prompt-form") as HTMLFormElement;
      const messagesDiv = document.getElementById("messages") as HTMLDivElement;

      promptInput.value = "Hello";
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({ reply: "Hi User" });

      promptForm.dispatchEvent(new Event("submit"));

      expect(messagesDiv.textContent).toContain("Hello");
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(messagesDiv.innerHTML).toContain("Hi User");
    });

    it("should display error message if backend returns an error", async () => {
      const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
      const promptForm = document.getElementById("prompt-form") as HTMLFormElement;
      const messagesDiv = document.getElementById("messages") as HTMLDivElement;

      promptInput.value = "Hello";
      vi.mocked(mockMessageService.sendMessage).mockResolvedValue({ error: "API Quota Exceeded" });

      promptForm.dispatchEvent(new Event("submit"));
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const errorMsg = messagesDiv.querySelector(".message.error");
      expect(errorMsg?.textContent).toContain("Error: API Quota Exceeded");
    });

    it("should display error message if sending message throws exception", async () => {
      const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
      const promptForm = document.getElementById("prompt-form") as HTMLFormElement;
      const messagesDiv = document.getElementById("messages") as HTMLDivElement;

      promptInput.value = "Hello";
      vi.mocked(mockMessageService.sendMessage).mockRejectedValue(new Error("Network Failure"));

      promptForm.dispatchEvent(new Event("submit"));
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const errorMsg = messagesDiv.querySelector(".message.error");
      expect(errorMsg?.textContent).toContain("Error: Error: Network Failure");
    });
  });

  describe("Icon Logic", () => {
    it("should render PIN icon and call PIN_TAB when tab is pinnable", async () => {
      const currentTab = { id: 101, title: "Google", url: "https://google.com" };
      vi.mocked(mockSyncStorage.get).mockResolvedValue("test-api-key");
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_CONTEXT) {
          return { pinnedContexts: [], tab: currentTab };
        }
        return { success: true };
      });

      await controller.start();

      const pinButton = document.getElementById("pin-tab-button") as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain("pinnable");
      expect(pinButton.disabled).toBe(false);

      pinButton.click();
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({ type: MessageTypes.PIN_TAB });
    });

    it("should render UNPIN icon and call UNPIN_TAB when tab is already pinned", async () => {
      const currentTab = { id: 101, title: "Google", url: "https://google.com" };
      const pinnedContexts = [currentTab];

      vi.mocked(mockSyncStorage.get).mockResolvedValue("test-api-key");
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_CONTEXT) {
          return { pinnedContexts, tab: currentTab };
        }
        return { success: true };
      });

      await controller.start();

      const pinButton = document.getElementById("pin-tab-button") as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain("pinned");
      expect(pinButton.title).toContain("Unpin");

      pinButton.click();
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: MessageTypes.UNPIN_TAB,
        tabId: 101,
      });
    });

    it("should render RESTRICTED icon and be disabled when URL is restricted", async () => {
      const currentTab = { id: 102, title: "Settings", url: "chrome://settings" };
      
      vi.mocked(mockSyncStorage.get).mockResolvedValue("test-api-key");
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_CONTEXT) {
          return { pinnedContexts: [], tab: currentTab };
        }
        return { success: true };
      });

      await controller.start();

      const pinButton = document.getElementById("pin-tab-button") as HTMLButtonElement;
      expect(pinButton).toBeTruthy();
      expect(pinButton.className).toContain("restricted");
      expect(pinButton.disabled).toBe(true);
      expect(pinButton.title).toContain("restricted");
    });

    it("should display a system message if pinning fails", async () => {
      const currentTab = { id: 101, title: "Google", url: "https://google.com" };
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_CONTEXT) {
          return { pinnedContexts: [], tab: currentTab };
        }
        if (msg.type === MessageTypes.PIN_TAB) {
          return { success: false, message: "Cannot pin restricted URL" };
        }
        return { success: true };
      });

      await controller.start();

      const pinButton = document.getElementById("pin-tab-button") as HTMLButtonElement;
      pinButton.click();

      // Wait for async appendMessage
      await new Promise(resolve => setTimeout(resolve, 0));

      const messagesDiv = document.getElementById("messages") as HTMLDivElement;
      const systemMsg = messagesDiv.querySelector(".message.system");
      expect(systemMsg?.textContent).toBe("System: Cannot pin restricted URL");
    });
  });

  describe("History Rehydration Error Handling", () => {
    it("should display a system message if history loading throws an error", async () => {
      vi.mocked(mockMessageService.sendMessage).mockImplementation(async (msg: any) => {
        if (msg.type === MessageTypes.GET_HISTORY) {
          throw new Error("Storage failure");
        }
        return { success: true };
      });

      await controller.start();

      const messagesDiv = document.getElementById("messages") as HTMLDivElement;
      const systemMsg = messagesDiv.querySelector(".message.system");
      expect(systemMsg?.textContent).toBe("System: Failed to load chat history. Try starting a new chat.");
    });
  });
});