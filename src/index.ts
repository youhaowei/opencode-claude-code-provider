import { type Plugin, tool } from "@opencode-ai/plugin";
import type { Event, Config } from "@opencode-ai/sdk";
import { createClaudeCode, type ClaudeCodeProvider } from "ai-sdk-provider-claude-code";
import { z } from "zod";
import { existsSync, realpathSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const CLAUDE_CODE_MODELS = ["sonnet", "opus", "haiku"] as const;
type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number];

function isClaudeLoggedIn(): boolean {
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const credentialsPath = join(claudeConfigDir, "credentials.json");
  return existsSync(credentialsPath);
}

function getSdkWrapperPath(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(realpathSync(currentFile));
    return `file://${join(currentDir, "sdk-wrapper.js")}`;
  } catch {
    return `file://${join(homedir(), "Projects", "opencode-claude-code-provider", "dist", "sdk-wrapper.js")}`;
  }
}

const CLAUDE_CODE_PROVIDER_CONFIG = {
  name: "Claude Code",
  api: "local://claude-code",
  npm: getSdkWrapperPath(),
  models: {
    sonnet: {
      id: "sonnet",
      name: "Sonnet",
      attachment: true,
      reasoning: true,
      temperature: false,
      tool_call: true,
      cost: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: 200000,
        output: 16384,
      },
    },
    opus: {
      id: "opus",
      name: "Opus",
      attachment: true,
      reasoning: true,
      temperature: false,
      tool_call: true,
      cost: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: 200000,
        output: 16384,
      },
    },
    haiku: {
      id: "haiku",
      name: "Haiku",
      attachment: true,
      reasoning: false,
      temperature: false,
      tool_call: true,
      cost: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: 200000,
        output: 16384,
      },
    },
  },
};

/**
 * Creates a Claude Code provider instance
 */
function createClaudeCodeProvider(): ClaudeCodeProvider {
  return createClaudeCode({
    defaultSettings: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
      permissionMode: "default",
    },
  });
}

/**
 * Claude Code Provider Plugin for OpenCode
 *
 * Allows users to use Claude Code (Agent SDK) models without API keys,
 * leveraging their existing `claude login` subscription.
 */
const ClaudeCodeProviderPlugin: Plugin = async () => {
  const provider = createClaudeCodeProvider();

  return {
    config: async (input: Config) => {
      if (!input.provider) {
        input.provider = {};
      }
      input.provider["claude-code"] = CLAUDE_CODE_PROVIDER_CONFIG;
      
      console.log("[Claude Code Provider] Registered provider with models:", Object.keys(CLAUDE_CODE_PROVIDER_CONFIG.models).join(", "));
    },

    auth: {
      provider: "claude-code",
      async loader(_getAuth, providerInfo) {
        if (providerInfo?.models) {
          for (const model of Object.values(providerInfo.models)) {
            model.cost = {
              input: 0,
              output: 0,
              cache: {
                read: 0,
                write: 0,
              },
            };
          }
        }
        return {};
      },
      methods: [
        {
          type: "api" as const,
          label: isClaudeLoggedIn() 
            ? "Activate (Claude CLI detected)" 
            : "Activate (requires `claude login` first)",
          prompts: isClaudeLoggedIn() 
            ? [] 
            : [
                {
                  type: "text" as const,
                  key: "confirmation", 
                  message: "Run `claude login` first, then type 'ok' to continue",
                  placeholder: "ok",
                },
              ],
          async authorize(_inputs?: Record<string, string>) {
            if (!isClaudeLoggedIn()) {
              return { type: "failed" as const };
            }
            return {
              type: "success" as const,
              key: "claude-code-active",
            };
          },
        },
      ],
    },

    tool: {
      "claude-code-query": tool({
        description:
          "Execute a direct query using Claude Agent SDK. Useful when you need to leverage Claude Code's specific capabilities with full tool access.",
        args: {
          model: z
            .enum(CLAUDE_CODE_MODELS)
            .default("sonnet")
            .describe("Model to use (sonnet, opus, or haiku)"),
          prompt: z.string().describe("The prompt to send to Claude Code"),
          system: z
            .string()
            .optional()
            .describe("Optional system prompt override"),
        },
        execute: async ({ model, prompt, system }, _context) => {
          try {
            const modelInstance = provider(model as ClaudeCodeModel);

            // Use the Vercel AI SDK to generate text
            const { generateText } = await import("ai");

            const result = await generateText({
              model: modelInstance,
              prompt,
              system,
            });

            return JSON.stringify({
              success: true,
              text: result.text,
              usage: result.usage,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return JSON.stringify({
              success: false,
              error: errorMessage,
            });
          }
        },
      }),
    },

    event: async ({ event }: { event: Event }) => {
      if (event.type === "server.connected") {
        console.log("[Claude Code Provider] Plugin loaded");
        console.log(
          `[Claude Code Provider] Available models: claude-code/${CLAUDE_CODE_MODELS.join(", claude-code/")}`
        );
      }
    },
  };
};

export default ClaudeCodeProviderPlugin;
