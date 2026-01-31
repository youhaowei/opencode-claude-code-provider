import { 
  createClaudeCode as originalCreateClaudeCode, 
  type ClaudeCodeSettings,
  claudeCode,
  ClaudeCodeLanguageModel,
  isAuthenticationError,
  isTimeoutError,
  getErrorMetadata,
} from "ai-sdk-provider-claude-code";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

const IGNORED_OPTIONS = new Set(["apiKey", "baseURL", "headers", "fetch", "name", "includeUsage"]);

function findClaudeCli(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return "claude";
}

function filterSettings(options?: Record<string, unknown>): ClaudeCodeSettings | undefined {
  if (!options) return undefined;
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!IGNORED_OPTIONS.has(key)) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? (filtered as ClaudeCodeSettings) : undefined;
}

/**
 * Converts V3 finish reason (object) to V2 format (string)
 */
function convertFinishReason(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }
  if (reason && typeof reason === "object" && "unified" in reason) {
    return (reason as { unified: string }).unified;
  }
  return "other";
}

/**
 * Transforms a V3 stream part to V2 format
 * Main changes:
 * - finishReason: { unified: string, raw: string } → string
 */
function transformStreamPart(part: unknown): unknown {
  if (!part || typeof part !== "object") {
    return part;
  }
  
  const p = part as Record<string, unknown>;
  
  if (p.type === "finish" && p.finishReason !== undefined) {
    return {
      ...p,
      finishReason: convertFinishReason(p.finishReason),
    };
  }
  
  if (p.type === "finish-step" && p.finishReason !== undefined) {
    return {
      ...p,
      finishReason: convertFinishReason(p.finishReason),
    };
  }
  
  return part;
}

/**
 * Creates a transformed stream that converts V3 parts to V2 format
 */
function createV2CompatibleStream(v3Stream: ReadableStream): ReadableStream {
  const reader = v3Stream.getReader();
  
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(transformStreamPart(value));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

/**
 * Wraps a V3 language model to return V2-compatible streams
 */
function wrapLanguageModel(model: any): any {
  const originalDoStream = model.doStream.bind(model);
  const originalDoGenerate = model.doGenerate?.bind(model);
  
  return {
    ...model,
    get specificationVersion() {
      return "v2";
    },
    async doStream(options: any) {
      const result = await originalDoStream(options);
      return {
        ...result,
        stream: createV2CompatibleStream(result.stream),
      };
    },
    async doGenerate(options: any) {
      if (!originalDoGenerate) {
        throw new Error("doGenerate not supported");
      }
      const result = await originalDoGenerate(options);
      if (result.finishReason !== undefined) {
        return {
          ...result,
          finishReason: convertFinishReason(result.finishReason),
        };
      }
      return result;
    },
  };
}

export function createClaudeCode(_options?: Record<string, unknown>) {
  const claudeCliPath = findClaudeCli();
  
  const provider = originalCreateClaudeCode({
    defaultSettings: {
      pathToClaudeCodeExecutable: claudeCliPath,
    },
  });
  
  return {
    languageModel(modelId: string, modelOptions?: Record<string, unknown>) {
      const model = provider.languageModel(modelId, filterSettings(modelOptions));
      return wrapLanguageModel(model);
    },
    chat(modelId: string, modelOptions?: Record<string, unknown>) {
      const model = provider.chat(modelId, filterSettings(modelOptions));
      return wrapLanguageModel(model);
    },
  };
}

export { 
  claudeCode,
  ClaudeCodeLanguageModel,
  isAuthenticationError,
  isTimeoutError,
  getErrorMetadata,
};
