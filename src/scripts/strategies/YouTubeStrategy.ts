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

import { IContentStrategy } from './IContentStrategy';
import { ContentPart } from '../types';

export class YouTubeStrategy implements IContentStrategy {
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // Match youtube.com, www.youtube.com, m.youtube.com, music.youtube.com
      const isYouTubeDomain = /(^|\.)youtube\.com$/i.test(parsedUrl.hostname);

      if (isYouTubeDomain) {
        // Standard watch or shorts
        return (
          (parsedUrl.pathname === '/watch' &&
            parsedUrl.searchParams.has('v')) ||
          parsedUrl.pathname.startsWith('/shorts/')
        );
      }

      // Handle youtu.be just in case, though tab URLs usually redirect.
      return parsedUrl.hostname === 'youtu.be';
    } catch {
      return false;
    }
  }

  async getContent(_tabId: number, url: string): Promise<ContentPart> {
    return {
      type: 'file_data',
      mimeType: 'video/mp4',
      fileUri: url,
    };
  }
}
