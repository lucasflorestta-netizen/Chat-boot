export type SpellSuggestion = {
  word: string;
  start: number;
  end: number;
  suggestions: string[];
};

type WorkerResult = {
  type: 'ready' | 'error' | 'result';
  id?: number;
  suggestions?: string[];
  message?: string;
};

let worker: Worker | null = null;
let workerReady: Promise<boolean> | null = null;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (suggestions: string[]) => void }
>();

function dictUrls(): { aff: string; dic: string } {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const dictBase = `${prefix}dictionaries/pt`;
  return {
    aff: `${dictBase}/index.aff`,
    dic: `${dictBase}/index.dic`,
  };
}

async function ensureWorker(): Promise<boolean> {
  if (workerReady) return workerReady;

  workerReady = (async () => {
    try {
      worker = new Worker(new URL('./spellcheck.worker.ts', import.meta.url), {
        type: 'module',
      });

      const ready = new Promise<boolean>((resolve) => {
        worker!.onmessage = (event: MessageEvent<WorkerResult>) => {
          const data = event.data;
          if (data.type === 'ready') {
            resolve(true);
            return;
          }
          if (data.type === 'error') {
            resolve(false);
            return;
          }
          if (data.type === 'result' && typeof data.id === 'number') {
            const wait = pending.get(data.id);
            if (wait) {
              pending.delete(data.id);
              wait.resolve(data.suggestions ?? []);
            }
          }
        };
        worker!.onerror = () => resolve(false);
      });

      const urls = dictUrls();
      const [affRes, dicRes] = await Promise.all([
        fetch(urls.aff),
        fetch(urls.dic),
      ]);
      if (!affRes.ok || !dicRes.ok) {
        worker.terminate();
        worker = null;
        return false;
      }
      const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
      worker.postMessage({ type: 'init', aff, dic });
      return ready;
    } catch {
      worker = null;
      return false;
    }
  })();

  return workerReady;
}

const SKIP_WORD =
  /^(\/|https?:\/\/|www\.|\d+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i;

function shouldSkipWord(word: string): boolean {
  if (word.length < 3) return true;
  if (SKIP_WORD.test(word)) return true;
  if (/\d/.test(word) && !/\p{L}/u.test(word)) return true;
  return false;
}

function matchSuggestionCase(original: string, suggestion: string): string {
  if (!original || !suggestion) return suggestion;
  if (original === original.toLocaleUpperCase('pt-BR')) {
    return suggestion.toLocaleUpperCase('pt-BR');
  }
  if (original[0] === original[0].toLocaleUpperCase('pt-BR')) {
    return suggestion[0].toLocaleUpperCase('pt-BR') + suggestion.slice(1);
  }
  return suggestion;
}

/**
 * If `cursor` sits right after a completed word (separator just typed),
 * return that word’s range; otherwise null.
 */
export function getCompletedWordAt(
  text: string,
  cursor: number,
): { word: string; start: number; end: number } | null {
  if (cursor <= 0 || text.startsWith('/')) return null;

  const prev = text[cursor - 1];
  if (!prev || !/[\s.,!?;:]/.test(prev)) return null;

  let end = cursor - 1;
  while (end > 0 && /[\s.,!?;:]/.test(text[end - 1] ?? '')) end -= 1;

  let start = end;
  while (start > 0 && !/[\s.,!?;:]/.test(text[start - 1] ?? '')) start -= 1;

  const word = text.slice(start, end);
  if (!word || shouldSkipWord(word)) return null;
  return { word, start, end };
}

export async function suggestForWord(word: string): Promise<string[]> {
  const ok = await ensureWorker();
  if (!ok || !worker) return [];

  const id = nextRequestId++;
  const suggestions = await new Promise<string[]>((resolve) => {
    pending.set(id, { resolve });
    worker!.postMessage({ type: 'suggest', id, word });
  });

  return suggestions.map((s) => matchSuggestionCase(word, s));
}

export async function checkCompletedWord(
  text: string,
  cursor: number,
): Promise<SpellSuggestion | null> {
  const completed = getCompletedWordAt(text, cursor);
  if (!completed) return null;

  const suggestions = await suggestForWord(completed.word);
  if (suggestions.length === 0) return null;

  return {
    word: completed.word,
    start: completed.start,
    end: completed.end,
    suggestions,
  };
}

export function applyWordReplacement(
  text: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

/** Prefetch dictionary/worker in the background. */
export function prefetchSpellcheck(): void {
  void ensureWorker();
}
