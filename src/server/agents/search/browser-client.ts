/**
 * CDP Chrome Control for Linux/Docker.
 *
 * Launch chromium headless on port 9223.
 * WebSocket CDP connection for browser automation.
 * Singleton pattern.
 */

import { spawn, execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import WebSocket from 'ws';
import { logger } from '../../utils/logger.js';
import axios from 'axios';

// CDP Protocol types
interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface CDPMessage {
  id: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

// =========================================================================
// CDP Connection
// =========================================================================

class CDPConnection {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingMessages: Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private eventListeners: Map<string, Array<(params: unknown) => void>> = new Map();

  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.debug('[CDP] WebSocket connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: CDPMessage = JSON.parse(data.toString());
          if (message.id !== undefined) {
            // Response to a command
            const pending = this.pendingMessages.get(message.id);
            if (pending) {
              this.pendingMessages.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message));
              } else {
                pending.resolve(message.result);
              }
            }
          } else if (message.method) {
            // CDP event (no id, has method)
            const listeners = this.eventListeners.get(message.method);
            if (listeners) {
              for (const listener of listeners) {
                listener(message.params);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        for (const [, pending] of this.pendingMessages) {
          pending.reject(new Error('WebSocket closed'));
        }
        this.pendingMessages.clear();
        this.eventListeners.clear();
      });
    });
  }

  /**
   * Register a one-time or persistent listener for a CDP event.
   */
  on(event: string, handler: (params: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }

  /**
   * Remove a specific listener for a CDP event.
   */
  off(event: string, handler: (params: unknown) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = ++this.messageId;
    const message: CDPMessage = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error(`CDP command timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingMessages.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// =========================================================================
// Browser Client (Singleton)
// =========================================================================

const CDP_PORT = 9223;

class BrowserClient {
  private cdp: CDPConnection | null = null;
  private browserProcess: ChildProcess | null = null;

  private findChromePath(): string | null {
    const paths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  private killExisting(): void {
    try {
      execSync(`fuser -k ${CDP_PORT}/tcp 2>/dev/null || true`, {
        stdio: 'ignore',
        timeout: 5000,
      });
    } catch {
      try {
        execSync(
          `lsof -ti:${CDP_PORT} | xargs -r kill -9 2>/dev/null || true`,
          { stdio: 'ignore', timeout: 5000 }
        );
      } catch {
        // ignore
      }
    }
  }

  /**
   * Ensure Chrome is running and CDP is connected.
   */
  async ensureConnected(): Promise<void> {
    if (this.cdp?.isConnected()) return;

    // Close stale connection
    this.cdp?.close();
    this.cdp = null;

    // Try connecting to existing browser first
    try {
      await this.connectCDP();
      return;
    } catch {
      // Need to launch browser
    }

    await this.launchBrowser();
    await this.connectCDP();
  }

  private async launchBrowser(): Promise<void> {
    this.killExisting();
    await new Promise(r => setTimeout(r, 500));

    const chromePath = this.findChromePath();
    if (!chromePath) {
      throw new Error(
        'Chromium not found. Install with: apt-get install -y chromium'
      );
    }

    const args = [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-background-networking',
      '--window-size=1280,800',
      '--user-data-dir=/tmp/chrome-profile-search',
      'about:blank',
    ];

    this.browserProcess = spawn(chromePath, args, {
      stdio: 'ignore',
      detached: true,
    });

    this.browserProcess.unref();

    // Wait for Chrome to start
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const resp = await axios.get(`http://127.0.0.1:${CDP_PORT}/json/version`, {
          timeout: 2000,
        });
        if (resp.data) {
          logger.info('Chrome launched successfully on port ' + CDP_PORT);
          return;
        }
      } catch {
        // Keep waiting
      }
    }

    throw new Error('Chrome launch timeout');
  }

  private async connectCDP(): Promise<void> {
    // Get page target
    const resp = await axios.get<CDPTarget[]>(
      `http://127.0.0.1:${CDP_PORT}/json`,
      { timeout: 5000 }
    );

    const pageTarget = resp.data.find(t => t.type === 'page');
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('No page target found');
    }

    this.cdp = new CDPConnection();
    await this.cdp.connect(pageTarget.webSocketDebuggerUrl);
    logger.info('CDP connected to page target');
  }

  /**
   * Navigate to a URL and wait for load.
   * Uses CDP Page.loadEventFired instead of a fixed sleep for reliable page loading.
   */
  async navigate(url: string): Promise<{ success: boolean; url?: string; title?: string }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.ensureConnected();
      try {
        await this.cdp!.send('Page.enable');
        await this.cdp!.send('Page.navigate', { url });

        // Wait for page load event with timeout
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => {
            this.cdp!.off('Page.loadEventFired', handler);
            resolve();
          }, 15000);

          const handler = (_params: unknown) => {
            clearTimeout(timeoutId);
            this.cdp!.off('Page.loadEventFired', handler);
            resolve();
          };

          this.cdp!.on('Page.loadEventFired', handler);
        });

        await new Promise(r => setTimeout(r, 500));

        const info = await this.getPageInfo();
        return { success: true, url: info.url, title: info.title };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt === 0 && (msg.includes('timeout') || msg.includes('WebSocket') || msg.includes('not connected'))) {
          // CDP broken - restart browser and retry once
          logger.warn(`CDP error on navigate, restarting browser: ${msg}`);
          await this.close();
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return {
          success: false,
          url: undefined,
          title: `Error: ${msg}`,
        };
      }
    }
    return { success: false, url: undefined, title: 'Error: navigate failed after retry' };
  }

  /**
   * Execute JavaScript in the page context.
   * Returns a structured result: { success, content }.
   * On error, returns { success: false, content: 'Error: ...' } instead of throwing.
   */
  async executeScript(expression: string): Promise<{ success: boolean; content: string }> {
    try {
      await this.ensureConnected();
      const result = (await this.cdp!.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as {
        result?: { value?: unknown; type?: string; description?: string };
        exceptionDetails?: { text?: string };
      };

      if (result.exceptionDetails) {
        return {
          success: false,
          content: `Error: ${result.exceptionDetails.text || 'Script execution error'}. Try a different selector or script.`,
        };
      }

      const val = result.result?.value;
      if (val === undefined || val === null) return { success: true, content: '' };
      return {
        success: true,
        content: typeof val === 'string' ? val : JSON.stringify(val),
      };
    } catch (error) {
      return {
        success: false,
        content: `Error: ${error instanceof Error ? error.message : String(error)}. The page may not be loaded or the browser connection was lost.`,
      };
    }
  }

  /**
   * Get text content of the page or an element.
   */
  async getText(selector?: string): Promise<{ success: boolean; content: string }> {
    const expr = selector
      ? `(document.querySelector(${JSON.stringify(selector)})?.innerText || '')`
      : `document.body.innerText`;
    const result = await this.executeScript(expr);
    if (!result.success) return result;
    // Truncate very long text
    const text = result.content;
    return {
      success: true,
      content: text.length > 8000 ? text.slice(0, 8000) + '...(truncated)' : text,
    };
  }

  /**
   * Get HTML of the page or an element.
   */
  async getHtml(selector?: string): Promise<{ success: boolean; content: string }> {
    const expr = selector
      ? `(document.querySelector(${JSON.stringify(selector)})?.outerHTML || '')`
      : `document.documentElement.outerHTML.substring(0, 10000)`;
    const result = await this.executeScript(expr);
    if (!result.success) return result;
    const html = result.content;
    return {
      success: true,
      content: html.length > 10000 ? html.slice(0, 10000) + '...(truncated)' : html,
    };
  }

  /**
   * Click an element by CSS selector.
   */
  async click(selector: string): Promise<{ success: boolean; content: string }> {
    return this.executeScript(
      `(function() { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found: ${selector}'); el.click(); return 'clicked'; })()`
    );
  }

  /**
   * Fill an input field (clear + set value + trigger events).
   */
  async fill(selector: string, value: string): Promise<{ success: boolean; content: string }> {
    return this.executeScript(
      `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ${selector}');
        el.focus();
        el.value = '';
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled';
      })()`
    );
  }

  /**
   * Type text character by character.
   */
  async type(text: string): Promise<void> {
    await this.ensureConnected();
    for (const char of text) {
      await this.cdp!.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      await this.cdp!.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
      await new Promise(r => setTimeout(r, 30));
    }
  }

  /**
   * Press a keyboard key.
   */
  async pressKey(key: string): Promise<void> {
    await this.ensureConnected();
    await this.cdp!.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      windowsVirtualKeyCode: keyToCode(key),
    });
    await this.cdp!.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      windowsVirtualKeyCode: keyToCode(key),
    });
  }

  /**
   * Wait for a CSS selector to appear on the page.
   */
  async waitFor(selector: string, timeoutMs = 10_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.executeScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (result.success && result.content === 'true') return true;
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  /**
   * Get current page URL and title.
   */
  async getPageInfo(): Promise<{ url: string; title: string }> {
    const urlResult = await this.executeScript('window.location.href');
    const titleResult = await this.executeScript('document.title');
    return {
      url: urlResult.success ? urlResult.content : '',
      title: titleResult.success ? titleResult.content : '',
    };
  }

  /**
   * Take a screenshot (base64 PNG).
   */
  async screenshot(): Promise<string> {
    await this.ensureConnected();
    const result = (await this.cdp!.send('Page.captureScreenshot', {
      format: 'png',
    })) as { data: string };
    return result.data;
  }

  /**
   * Close browser and clean up.
   */
  async close(): Promise<void> {
    this.cdp?.close();
    this.cdp = null;

    if (this.browserProcess) {
      try {
        this.browserProcess.kill();
      } catch {
        // ignore
      }
      this.browserProcess = null;
    }

    this.killExisting();
    logger.info('Browser closed');
  }
}

function keyToCode(key: string): number {
  const map: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Escape: 27,
    Backspace: 8,
    Delete: 46,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
    Space: 32,
  };
  return map[key] ?? 0;
}

// Singleton instance
export const browserClient = new BrowserClient();
