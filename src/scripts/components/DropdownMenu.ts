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

/**
 * Shadcn-style dropdown menu component.
 * Replaces native <select> with a custom popover menu.
 */

export interface DropdownItem {
  value: string;
  label: string;
  description?: string;
}

export class DropdownMenu {
  private trigger: HTMLButtonElement;
  private menu: HTMLDivElement;
  private itemElements: HTMLElement[] = [];
  private selectedValue: string;
  private onChange: ((value: string) => void) | null;
  private isOpen = false;
  private destroyFns: Array<() => void> = [];

  /** Get the currently selected value */
  get value(): string {
    return this.selectedValue;
  }

  /** Set the selected value (silent — no onChange callback) */
  set value(v: string) {
    this.selectItem(v, false);
  }

  constructor(
    container: HTMLElement,
    items: DropdownItem[],
    selectedValue: string,
    onChange: (value: string) => void,
  ) {
    this.selectedValue = selectedValue;
    this.onChange = onChange;

    // ── Trigger Button ──
    this.trigger = document.createElement('button');
    this.trigger.className = 'dropdown-trigger';
    this.trigger.type = 'button';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    const triggerLabel = document.createElement('span');
    triggerLabel.className = 'dropdown-trigger__label';
    this.trigger.appendChild(triggerLabel);

    const chevron = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );
    chevron.setAttribute('width', '14');
    chevron.setAttribute('height', '14');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('stroke-linejoin', 'round');
    chevron.classList.add('dropdown-trigger__chevron');
    chevron.setAttribute('aria-hidden', 'true');
    const chevronPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );
    chevronPath.setAttribute('d', 'm6 9 6 6 6-6');
    chevron.appendChild(chevronPath);
    this.trigger.appendChild(chevron);

    // ── Menu ──
    this.menu = document.createElement('div');
    this.menu.className = 'dropdown-menu';
    this.menu.setAttribute('role', 'listbox');
    this.menu.hidden = true;

    // Build items
    this.buildItems(items);

    container.appendChild(this.trigger);
    container.appendChild(this.menu);

    // ── Events ──
    const onTriggerClick = (e: MouseEvent) => {
      e.stopPropagation();
      this.toggle();
    };
    this.trigger.addEventListener('click', onTriggerClick);
    this.destroyFns.push(() =>
      this.trigger.removeEventListener('click', onTriggerClick),
    );

    const onDocumentClick = (e: MouseEvent) => {
      if (
        this.isOpen &&
        !this.menu.contains(e.target as Node) &&
        !this.trigger.contains(e.target as Node)
      ) {
        this.close();
      }
    };
    document.addEventListener('click', onDocumentClick);
    this.destroyFns.push(() =>
      document.removeEventListener('click', onDocumentClick),
    );

    const onKeydown = (e: KeyboardEvent) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        this.trigger.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.focusNextItem(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const focused = this.menu.querySelector(
          '[role="option"]:focus',
        ) as HTMLElement | null;
        if (focused) {
          focused.click();
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.focusItem(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.focusItem(this.itemElements.length - 1);
      }
    };
    document.addEventListener('keydown', onKeydown);
    this.destroyFns.push(() =>
      document.removeEventListener('keydown', onKeydown),
    );

    // Initial label
    this.updateTriggerLabel();
  }

  /** Clean up event listeners */
  destroy() {
    for (const fn of this.destroyFns) {
      fn();
    }
    this.destroyFns.length = 0;
    this.trigger.remove();
    this.menu.remove();
  }

  /** Programmatically select a value and fire the onChange callback */
  select(value: string) {
    this.selectItem(value, true);
  }

  private buildItems(items: DropdownItem[]) {
    this.menu.innerHTML = '';
    this.itemElements = [];

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'dropdown-menu-item';
      el.setAttribute('role', 'option');
      el.setAttribute(
        'aria-selected',
        String(item.value === this.selectedValue),
      );
      el.dataset.value = item.value;

      // Main layout (heading + subtext)
      const layout = document.createElement('div');
      layout.className = 'dropdown-menu-item__layout';

      const heading = document.createElement('span');
      heading.className = 'dropdown-menu-item__heading';
      heading.textContent = item.label;

      layout.appendChild(heading);

      if (item.description) {
        const subtext = document.createElement('span');
        subtext.className = 'dropdown-menu-item__subtext';
        subtext.textContent = item.description;
        layout.appendChild(subtext);
      }

      // Check mark
      const check = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      check.setAttribute('width', '16');
      check.setAttribute('height', '16');
      check.setAttribute('viewBox', '0 0 16 16');
      check.setAttribute('fill', 'currentColor');
      check.classList.add('dropdown-menu-item__check');
      const checkPath = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      checkPath.setAttribute(
        'd',
        'M16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0C12.4183 0 16 3.58172 16 8ZM11.5303 6.53033L12.0607 6L11 4.93934L10.4697 5.46967L6.5 9.43934L5.53033 8.46967L5 7.93934L3.93934 9L4.46967 9.53033L5.96967 11.0303C6.26256 11.3232 6.73744 11.3232 7.03033 11.0303L11.5303 6.53033Z',
      );
      checkPath.setAttribute('fill-rule', 'evenodd');
      checkPath.setAttribute('clip-rule', 'evenodd');
      check.appendChild(checkPath);

      if (item.value === this.selectedValue) {
        check.style.opacity = '1';
      }

      el.appendChild(layout);
      el.appendChild(check);

      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        this.selectItem(item.value, true);
        this.close();
        this.trigger.focus();
      };
      el.addEventListener('click', onClick);

      this.menu.appendChild(el);
      this.itemElements.push(el);
    }
  }

  private selectItem(value: string, fireOnChange: boolean) {
    if (value === this.selectedValue && !fireOnChange) return;

    const previousValue = this.selectedValue;
    this.selectedValue = value;

    // Update aria-selected and check marks
    for (const el of this.itemElements) {
      const isSelected = el.dataset.value === value;
      el.setAttribute('aria-selected', String(isSelected));
      const check = el.querySelector(
        '.dropdown-menu-item__check',
      ) as HTMLElement;
      if (check) {
        check.style.opacity = isSelected ? '1' : '0';
      }
    }

    this.updateTriggerLabel();

    if (fireOnChange && this.onChange && value !== previousValue) {
      this.onChange(value);
    }
  }

  private updateTriggerLabel() {
    const labelEl = this.trigger.querySelector('.dropdown-trigger__label');
    if (!labelEl) return;
    const selectedItem = this.itemElements.find(
      (el) => el.dataset.value === this.selectedValue,
    );
    if (selectedItem) {
      const heading = selectedItem.querySelector(
        '.dropdown-menu-item__heading',
      );
      labelEl.textContent = heading ? heading.textContent : this.selectedValue;
    } else {
      labelEl.textContent = this.selectedValue;
    }
  }

  private toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.menu.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.menu.classList.add('dropdown-menu--open');

    // Position the menu below the trigger
    const triggerRect = this.trigger.getBoundingClientRect();
    this.menu.style.minWidth = `${Math.max(triggerRect.width, 200)}px`;
    this.menu.style.top = '100%';
    this.menu.style.left = '0';

    // Focus the selected item
    const selectedIdx = this.itemElements.findIndex(
      (el) => el.dataset.value === this.selectedValue,
    );
    if (selectedIdx >= 0) {
      this.focusItem(selectedIdx);
    } else if (this.itemElements.length > 0) {
      this.focusItem(0);
    }
  }

  private close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.menu.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.menu.classList.remove('dropdown-menu--open');
  }

  private focusItem(index: number) {
    if (index < 0 || index >= this.itemElements.length) return;
    this.itemElements[index].focus();
  }

  private focusNextItem(direction: 1 | -1) {
    const focused = this.menu.querySelector(
      '[role="option"]:focus',
    ) as HTMLElement | null;
    if (!focused) {
      this.focusItem(0);
      return;
    }
    const currentIndex = this.itemElements.indexOf(focused as HTMLElement);
    if (currentIndex < 0) {
      this.focusItem(0);
      return;
    }
    const nextIndex = Math.min(
      Math.max(currentIndex + direction, 0),
      this.itemElements.length - 1,
    );
    this.focusItem(nextIndex);
  }
}
