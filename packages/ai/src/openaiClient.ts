import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';

export interface OpenAiConfig {
  apiKey: string;
  textModel: string;
  imageModel: string;
}

export function createOpenAiClient(config: OpenAiConfig): OpenAI {
  return new OpenAI({ apiKey: config.apiKey });
}

export async function completeStructured<T>(
  client: OpenAI,
  options: {
    model: string;
    schema: ZodType<T>;
    schemaName: string;
    system: string;
    user: string;
    temperature?: number;
  },
): Promise<{ data: T; usage?: OpenAI.Completions.CompletionUsage }> {
  const run = async (user: string) => {
    const response = await client.beta.chat.completions.parse({
      model: options.model,
      temperature: options.temperature ?? 0.7,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: user },
      ],
      response_format: zodResponseFormat(options.schema, options.schemaName),
    });
    const parsed = response.choices[0]?.message.parsed;
    if (!parsed) {
      throw new Error(response.choices[0]?.message.refusal ?? 'Model returned empty structured output.');
    }
    return { data: parsed, usage: response.usage };
  };

  try {
    const first = await run(options.user);
    const checked = options.schema.safeParse(first.data);
    if (!checked.success) {
      throw checked.error;
    }
    return { data: checked.data, usage: first.usage };
  } catch (error) {
    const retry = await run(
      `${options.user}\n\nYour previous response failed validation. Return valid JSON that exactly matches the schema. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { data: options.schema.parse(retry.data), usage: retry.usage };
  }
}

export function isOpenAiConfigured(apiKey: string | undefined): boolean {
  return Boolean(apiKey && apiKey.trim().length > 0);
}
