/**
 * Browser Tool Definitions for Search Sub-Agent.
 *
 * 11 browser tools + complete tool.
 * Each maps to BrowserClient methods.
 */

import type { ToolHandler } from '../../types/index.js';
import { browserClient } from './browser-client.js';

export function createBrowserTools(): ToolHandler[] {
  return [
    // 1. navigate
    {
      definition: {
        type: 'function',
        function: {
          name: 'navigate',
          description: 'Navigate browser to a URL. Waits for page load.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'The URL to navigate to' },
            },
            required: ['url'],
          },
        },
      },
      execute: async (args) => {
        const url = args.url as string;
        const result = await browserClient.navigate(url);
        if (result.success) {
          return {
            success: true,
            result: `Navigated to ${result.url}\nTitle: ${result.title}`,
          };
        }
        return { success: false, error: result.title || 'Navigation failed' };
      },
    },

    // 2. execute_script
    {
      definition: {
        type: 'function',
        function: {
          name: 'execute_script',
          description:
            'Execute JavaScript in the browser page context. Returns the result as string. Use for data extraction from pages.',
          parameters: {
            type: 'object',
            properties: {
              script: {
                type: 'string',
                description: 'JavaScript expression to evaluate',
              },
            },
            required: ['script'],
          },
        },
      },
      execute: async (args) => {
        const result = await browserClient.executeScript(args.script as string);
        if (result.success) {
          return { success: true, result: result.content || '(empty result)' };
        }
        return { success: false, error: result.content };
      },
    },

    // 3. get_text
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_text',
          description:
            'Get text content of the page or a specific element. Omit selector for full page text.',
          parameters: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector (optional, omit for full page)',
              },
            },
          },
        },
      },
      execute: async (args) => {
        const result = await browserClient.getText(args.selector as string | undefined);
        if (result.success) {
          return { success: true, result: result.content || '(empty page)' };
        }
        return { success: false, error: result.content };
      },
    },

    // 4. get_html
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_html',
          description:
            'Get HTML of the page or a specific element. Useful for inspecting DOM structure.',
          parameters: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector (optional, omit for full page)',
              },
            },
          },
        },
      },
      execute: async (args) => {
        const result = await browserClient.getHtml(args.selector as string | undefined);
        if (result.success) {
          return { success: true, result: result.content || '(empty)' };
        }
        return { success: false, error: result.content };
      },
    },

    // 5. get_page_info
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_page_info',
          description: 'Get current page URL and title.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        try {
          const info = await browserClient.getPageInfo();
          return {
            success: true,
            result: `URL: ${info.url}\nTitle: ${info.title}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error getting page info: ${error instanceof Error ? error.message : String(error)}. The page may not be loaded.`,
          };
        }
      },
    },

    // 6. click
    {
      definition: {
        type: 'function',
        function: {
          name: 'click',
          description: 'Click an element on the page by CSS selector.',
          parameters: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector of the element to click',
              },
            },
            required: ['selector'],
          },
        },
      },
      execute: async (args) => {
        const result = await browserClient.click(args.selector as string);
        if (result.success) {
          return { success: true, result: `Clicked: ${args.selector}` };
        }
        return {
          success: false,
          error: `Click failed on "${args.selector}": ${result.content}. Verify the selector exists on the page using get_text or get_html first.`,
        };
      },
    },

    // 7. fill
    {
      definition: {
        type: 'function',
        function: {
          name: 'fill',
          description:
            'Fill an input field with text. Clears existing content first.',
          parameters: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector of the input field',
              },
              value: {
                type: 'string',
                description: 'Text to fill into the field',
              },
            },
            required: ['selector', 'value'],
          },
        },
      },
      execute: async (args) => {
        const result = await browserClient.fill(args.selector as string, args.value as string);
        if (result.success) {
          return { success: true, result: `Filled "${args.selector}" with value` };
        }
        return {
          success: false,
          error: `Fill failed on "${args.selector}": ${result.content}. Check the selector is correct and the element is an input field.`,
        };
      },
    },

    // 8. type
    {
      definition: {
        type: 'function',
        function: {
          name: 'type',
          description: 'Type text character by character (keyboard input).',
          parameters: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to type',
              },
            },
            required: ['text'],
          },
        },
      },
      execute: async (args) => {
        try {
          await browserClient.type(args.text as string);
          return { success: true, result: `Typed text (${(args.text as string).length} chars)` };
        } catch (error) {
          return {
            success: false,
            error: `Type failed: ${error instanceof Error ? error.message : String(error)}. Ensure the page is loaded and an input field is focused.`,
          };
        }
      },
    },

    // 9. press_key
    {
      definition: {
        type: 'function',
        function: {
          name: 'press_key',
          description:
            'Press a keyboard key. Valid keys: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, Space.',
          parameters: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Key name to press',
              },
            },
            required: ['key'],
          },
        },
      },
      execute: async (args) => {
        try {
          await browserClient.pressKey(args.key as string);
          return { success: true, result: `Pressed key: ${args.key}` };
        } catch (error) {
          return {
            success: false,
            error: `Key press failed for "${args.key}": ${error instanceof Error ? error.message : String(error)}. Valid keys: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight.`,
          };
        }
      },
    },

    // 10. wait
    {
      definition: {
        type: 'function',
        function: {
          name: 'wait',
          description:
            'Wait for a CSS selector to appear on the page (max 10 seconds).',
          parameters: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector to wait for',
              },
            },
            required: ['selector'],
          },
        },
      },
      execute: async (args) => {
        const found = await browserClient.waitFor(args.selector as string);
        if (found) {
          return { success: true, result: `Element found: ${args.selector}` };
        }
        return {
          success: false,
          error: `Timeout waiting for "${args.selector}" after 10 seconds. The element may not exist on this page. Try get_text to see current page content.`,
        };
      },
    },

    // 11. screenshot
    {
      definition: {
        type: 'function',
        function: {
          name: 'screenshot',
          description:
            'Take a screenshot of the current page. Returns base64 PNG. Use sparingly as it costs iterations.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        try {
          const data = await browserClient.screenshot();
          return {
            success: true,
            result: `Screenshot taken (${Math.round(data.length / 1024)}KB base64). Note: You cannot view this image directly.`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}. Use get_text instead to see page content.`,
          };
        }
      },
    },

    // 12. complete (terminal tool)
    {
      definition: {
        type: 'function',
        function: {
          name: 'complete',
          description:
            'Call this when your research is complete. Provide a detailed summary of findings with sources.',
          parameters: {
            type: 'object',
            properties: {
              summary: {
                type: 'string',
                description:
                  'Detailed research report with findings, key facts, and source URLs',
              },
            },
            required: ['summary'],
          },
        },
      },
      execute: async (args) => {
        return {
          success: true,
          result: args.summary as string,
        };
      },
    },
  ];
}
