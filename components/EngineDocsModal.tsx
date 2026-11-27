/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  X,
  BookOpen,
  KeyRound,
  CheckCircle2,
  Trash2,
  Loader2,
  Terminal,
  Server,
  Globe,
  Cpu,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { LocalModel, ProviderId, ProviderKeyStatus } from '../types';
import {
  BEAVERNET_OPENAI_BASE_URL,
  deleteApiKey,
  fetchApiKeyStatus,
  testAndSaveApiKey
} from '../services/geminiService';

interface EngineDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lmStudioUrl: string;
  onProviderModelsUpdated?: (provider: ProviderId, models: LocalModel[]) => void;
  onKeyStatusChanged?: (status: ProviderKeyStatus) => void;
}

interface ProviderCardConfig {
  id: ProviderId;
  title: string;
  envVar: string;
  endpoint: string;
  description: string;
  placeholder: string;
  icon: React.ReactNode;
}

export const EngineDocsModal: React.FC<EngineDocsModalProps> = ({
  isOpen,
  onClose,
  lmStudioUrl,
  onProviderModelsUpdated,
  onKeyStatusChanged
}) => {
  const [activeSection, setActiveSection] = useState<'keys' | 'docs'>('keys');
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatus>({
    local: { configured: false },
    beavernet: { configured: false },
    gemini: { configured: false }
  });
  const [inputs, setInputs] = useState<Record<ProviderId, string>>({
    local: '',
    beavernet: '',
    gemini: ''
  });
  const [busy, setBusy] = useState<Record<ProviderId, 'saving' | 'deleting' | null>>({
    local: null,
    beavernet: null,
    gemini: null
  });
  const [feedback, setFeedback] = useState<
    Record<ProviderId, { type: 'success' | 'error'; text: string } | null>
  >({
    local: null,
    beavernet: null,
    gemini: null
  });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const status = await fetchApiKeyStatus();
      if (!cancelled) {
        setKeyStatus(status);
        onKeyStatusChanged?.(status);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const providers: ProviderCardConfig[] = [
    {
      id: 'beavernet',
      title: 'BeaverNet',
      envVar: 'BEAVERNET_API_KEY',
      endpoint: BEAVERNET_OPENAI_BASE_URL,
      description:
        'A community pool of LLM compute. People with spare GPUs serve models; everyone else uses them through one OpenAI-compatible API.',
      placeholder: 'Cole sua chave de API do BeaverNet...',
      icon: <Server className="w-4 h-4 text-emerald-400" />
    },
    {
      id: 'gemini',
      title: 'Google Gemini',
      envVar: 'GEMINI_API_KEY',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      description:
        'API oficial do Google Gemini. Os modelos disponíveis são consultados em tempo real diretamente da sua conta.',
      placeholder: 'Cole sua GEMINI_API_KEY...',
      icon: <Globe className="w-4 h-4 text-blue-400" />
    },
    {
      id: 'local',
      title: 'OpenAI / Local (Opcional)',
      envVar: 'OPENAI_API_KEY',
      endpoint: lmStudioUrl,
      description:
        'Endpoints compatíveis com OpenAI (LM Studio, llama.cpp, Ollama, vLLM ou OpenAI remoto). Chave necessária apenas se o servidor exigir Bearer token.',
      placeholder: 'Cole sua OPENAI_API_KEY (opcional para servidor local)...',
      icon: <Cpu className="w-4 h-4 text-cyan-400" />
    }
  ];

  const handleTestAndSave = async (providerId: ProviderId) => {
    const rawKey = inputs[providerId].trim();
    if (!rawKey) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: { type: 'error', text: 'Digite uma chave de API antes de testar.' }
      }));
      return;
    }

    setBusy((prev) => ({ ...prev, [providerId]: 'saving' }));
    setFeedback((prev) => ({ ...prev, [providerId]: null }));

    try {
      const res = await testAndSaveApiKey(
        providerId,
        rawKey,
        providerId === 'local' ? lmStudioUrl : undefined
      );

      // Clear input field immediately so the key does NOT remain in the text box
      setInputs((prev) => ({ ...prev, [providerId]: '' }));

      const updatedStatus: ProviderKeyStatus = {
        ...keyStatus,
        [providerId]: { configured: true }
      };
      setKeyStatus(updatedStatus);
      onKeyStatusChanged?.(updatedStatus);

      if (res.models && onProviderModelsUpdated) {
        onProviderModelsUpdated(providerId, res.models);
      }

      setFeedback((prev) => ({
        ...prev,
        [providerId]: {
          type: 'success',
          text: res.message || 'Conexão validada e chave salva no .env!'
        }
      }));
    } catch (err: any) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: {
          type: 'error',
          text: err?.message || 'Falha ao testar a conexão com o provedor.'
        }
      }));
    } finally {
      setBusy((prev) => ({ ...prev, [providerId]: null }));
    }
  };

  const handleDeleteKey = async (providerId: ProviderId) => {
    setBusy((prev) => ({ ...prev, [providerId]: 'deleting' }));
    setFeedback((prev) => ({ ...prev, [providerId]: null }));

    try {
      await deleteApiKey(providerId);
      setInputs((prev) => ({ ...prev, [providerId]: '' }));

      const updatedStatus: ProviderKeyStatus = {
        ...keyStatus,
        [providerId]: { configured: false }
      };
      setKeyStatus(updatedStatus);
      onKeyStatusChanged?.(updatedStatus);
      onProviderModelsUpdated?.(providerId, []);

      setFeedback((prev) => ({
        ...prev,
        [providerId]: {
          type: 'success',
          text: 'Chave removida do .env com sucesso.'
        }
      }));
    } catch (err: any) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: {
          type: 'error',
          text: err?.message || 'Falha ao remover a chave.'
        }
      }));
    } finally {
      setBusy((prev) => ({ ...prev, [providerId]: null }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">
                PixelCraft AI — Engine Docs & API Keys
              </h2>
              <p className="text-xs text-zinc-400">
                Documentação da aplicação, provedores dinâmicos e configuração segura no <code className="text-cyan-400">.env</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Navigation */}
        <div className="flex gap-2 px-6 pt-4 border-b border-white/5 bg-zinc-950/30">
          <button
            type="button"
            onClick={() => setActiveSection('keys')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeSection === 'keys'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Chaves de API (.env)
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('docs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeSection === 'docs'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Documentação da Engine
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeSection === 'keys' ? (
            <>
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-zinc-300">
                <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">Armazenamento Seguro no .env</p>
                  <p className="text-zinc-400 leading-relaxed">
                    Ao clicar em <strong>Testar &amp; Salvar</strong>, a conexão é validada diretamente contra o provedor e a chave é gravada no arquivo <code className="text-cyan-400">.env</code> da aplicação (compartilhado com o modo Headless/CLI). Após salva, a chave é limpa do campo de texto e nunca é reexibida na interface.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {providers.map((p) => {
                  const isSaved = keyStatus[p.id].configured;
                  const state = busy[p.id];
                  const msg = feedback[p.id];

                  return (
                    <div
                      key={p.id}
                      className="bg-zinc-950/80 border border-white/10 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {p.icon}
                            <h3 className="text-sm font-bold text-white">{p.title}</h3>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/5">
                              {p.envVar}
                            </span>
                            {isSaved && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Chave salva
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400">{p.description}</p>
                          <p className="text-[11px] font-mono text-zinc-500">
                            Endpoint: {p.endpoint}
                          </p>
                        </div>

                        {isSaved && (
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(p.id)}
                            disabled={state !== null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all disabled:opacity-50"
                          >
                            {state === 'deleting' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Apagar chave
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          value={inputs[p.id]}
                          onChange={(e) =>
                            setInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={
                            isSaved
                              ? 'Chave salva no .env — digite uma nova chave para substituir'
                              : p.placeholder
                          }
                          disabled={state !== null}
                          autoComplete="off"
                          className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-500/60"
                        />
                        <button
                          type="button"
                          onClick={() => handleTestAndSave(p.id)}
                          disabled={state !== null || !inputs[p.id].trim()}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white transition-all"
                        >
                          {state === 'saving' ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Testando...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Testar &amp; Salvar
                            </>
                          )}
                        </button>
                      </div>

                      {msg && (
                        <div
                          className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${
                            msg.type === 'success'
                              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/10 border border-red-500/20 text-red-300'
                          }`}
                        >
                          {msg.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          )}
                          <span>{msg.text}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
              <section className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-400">
                  1. Visão Geral da Aplicação
                </h3>
                <p className="text-xs text-zinc-400">
                  O <strong>PixelCraft AI</strong> gera e transforma sprites de Pixel Art em SVG vetorial limpo (<code className="text-zinc-200">shape-rendering="crispEdges"</code>) com separação automática de camadas (<code className="text-zinc-200">&lt;g id="color"&gt;</code> e <code className="text-zinc-200">&lt;g id="light"&gt;</code>), validação de coordenadas inteiras, troca de paletas retrô e exportação PNG 1x / 8x e Sprite Sheets compatíveis com Aseprite.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-400">
                  2. Consulta Dinâmica de Modelos
                </h3>
                <p className="text-xs text-zinc-400">
                  Nenhum nome de modelo fica fixo ("baked") na interface. Ao selecionar <strong>OpenAI / Local</strong>, <strong>BeaverNet</strong> ou <strong>Google Gemini</strong>, a aplicação consulta a API de listagem de modelos do provedor em tempo real, garantindo que você sempre escolha apenas modelos realmente ativos e disponíveis.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-400">
                  3. Provedores Suportados
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-400">
                  <li>
                    <strong className="text-zinc-200">OpenAI / Local:</strong> LM Studio (<code className="text-zinc-300">http://127.0.0.1:1234</code>), llama.cpp (<code className="text-zinc-300">8080</code>), Ollama (<code className="text-zinc-300">11434</code>) ou qualquer servidor OpenAI-compatible.
                  </li>
                  <li>
                    <strong className="text-zinc-200">BeaverNet:</strong> Pool comunitário de computação LLM com GPUs compartilhadas via API OpenAI-compatible em <code className="text-emerald-400">https://net.beaverai.org/v1</code>.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Google Gemini:</strong> Modelos da família Gemini consultados dinamicamente via chave <code className="text-zinc-300">GEMINI_API_KEY</code>.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  4. Modo Headless (CLI &amp; Automação)
                </h3>
                <p className="text-xs text-zinc-400">
                  O gerador também roda 100% em modo Headless (Node.js puro, sem navegador), lendo automaticamente as chaves salvas no <code className="text-cyan-400">.env</code> e consultando os modelos ativos antes de executar:
                </p>
                <div className="bg-zinc-950 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-zinc-300 space-y-2 overflow-x-auto">
                  <div>
                    <span className="text-zinc-500"># Rodar com servidor Local (auto-detecção)</span>
                    <br />
                    npm run bulk -- --limit 3
                  </div>
                  <div>
                    <span className="text-zinc-500"># Rodar usando BeaverNet (https://net.beaverai.org/v1)</span>
                    <br />
                    npm run bulk -- --source beavernet --limit 3
                  </div>
                  <div>
                    <span className="text-zinc-500"># Rodar usando Google Gemini (consulta modelos automaticamente)</span>
                    <br />
                    npm run bulk -- --source gemini --limit 3
                  </div>
                  <div>
                    <span className="text-zinc-500"># Teste offline/procedural sem chamar API externa</span>
                    <br />
                    npm run bulk -- --source mock --limit 3
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
