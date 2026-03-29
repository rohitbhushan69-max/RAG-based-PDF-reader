import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EMBED_MODEL = 'gemini-embedding-001';
// Ordered by preference — will try each until one succeeds
const CHAT_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate embeddings for an array of texts.
 * @param {string[]} texts
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function generateEmbeddings(texts) {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const embeddings = [];

  // Process in batches of 100 to respect API limits
  const batchSize = 100;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await model.batchEmbedContents({
      requests: batch.map((text) => ({
        content: { parts: [{ text }] },
      })),
    });
    embeddings.push(...result.embeddings.map((e) => e.values));
  }

  return embeddings;
}

/**
 * Generate a single embedding for a query string.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text) {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

/**
 * Chat completion with context and conversation history.
 * Tries multiple models with retry on 429 rate limit errors.
 * @param {string} systemPrompt
 * @param {{ role: string, content: string }[]} history
 * @param {string} userMessage
 * @param {{ googleSearch?: boolean }} options
 * @returns {Promise<{ text: string, groundingMetadata?: object }>}
 */
export async function chatCompletion(systemPrompt, history, userMessage, options = {}) {
  const chatHistory = history.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Only models that support Google Search grounding (2.0+)
  const searchModels = ['gemini-2.0-flash', 'gemini-2.5-flash'];
  const modelsToTry = options.googleSearch ? searchModels : CHAT_MODELS;

  let lastError;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const modelConfig = {
          model: modelName,
          systemInstruction: systemPrompt,
        };

        if (options.googleSearch) {
          modelConfig.tools = [{ googleSearch: {} }];
        }

        const model = genAI.getGenerativeModel(modelConfig);
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(userMessage);
        console.log(`Chat completed with model: ${modelName}${options.googleSearch ? ' (with Google Search)' : ''}`);

        const response = { text: result.response.text() };

        // Extract grounding metadata if available
        if (options.googleSearch) {
          const candidate = result.response.candidates?.[0];
          if (candidate?.groundingMetadata) {
            response.groundingMetadata = candidate.groundingMetadata;
          }
        }

        return response;
      } catch (err) {
        lastError = err;
        if (err.status === 429) {
          console.warn(`Rate limited on ${modelName} (attempt ${attempt + 1}), trying next option...`);
          await sleep(1000);
          break; // try next model
        }
        // If google search tool not supported on this model, try next
        if (options.googleSearch && err.message?.includes('tool')) {
          console.warn(`Google Search not supported on ${modelName}, trying next...`);
          break;
        }
        throw err; // non-rate-limit errors should propagate
      }
    }
  }

  throw lastError;
}
