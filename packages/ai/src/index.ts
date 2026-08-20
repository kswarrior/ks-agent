import { BUILTIN_MODELS, createProvider } from './providers';
import { ModelRegistry, ModelRouter } from './model-router';
import { NVIDIAProvider } from './providers/nvidia';
import type { AIProvider, ChatChunk, ChatRequest, ChatResponse, ModelDefinition, ProviderConfig } from '@ks-agent/types';

export {
  BUILTIN_MODELS,
  createProvider,
  ModelRegistry,
  ModelRouter,
  NVIDIAProvider
};

export type {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  ProviderConfig
};