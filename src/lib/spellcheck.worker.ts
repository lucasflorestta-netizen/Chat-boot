/// <reference lib="webworker" />
import nspell from 'nspell';

type SpellInstance = {
  correct(word: string): boolean;
  suggest(word: string): string[];
};

let spell: SpellInstance | null = null;

self.onmessage = (event: MessageEvent) => {
  const data = event.data as
    | { type: 'init'; aff: string; dic: string }
    | { type: 'suggest'; id: number; word: string };

  if (data.type === 'init') {
    try {
      spell = nspell({ aff: data.aff, dic: data.dic }) as SpellInstance;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao iniciar corretor',
      });
    }
    return;
  }

  if (data.type === 'suggest') {
    if (!spell) {
      self.postMessage({ type: 'result', id: data.id, suggestions: [] });
      return;
    }
    if (spell.correct(data.word)) {
      self.postMessage({ type: 'result', id: data.id, suggestions: [] });
      return;
    }
    const suggestions = spell.suggest(data.word).slice(0, 5);
    self.postMessage({ type: 'result', id: data.id, suggestions });
  }
};
