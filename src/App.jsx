'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Hash,
  ListPlus,
  Music2,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  analyzeSymbols,
  applyChain,
  applyCommand,
  commandById,
  commandGroups,
  removeSymbolToken,
} from './lib/transforms.js';

const DRAFT_KEY = 'edit-pwa:draft';
const PRESETS_KEY = 'edit-pwa:presets';
const HISTORY_LIMIT = 120;

const readStoredValue = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
};

const createHistory = () => ({
  past: [],
  present: '',
  future: [],
  lastAction: null,
  typedAt: 0,
});

const limitHistory = (items) => items.slice(-HISTORY_LIMIT);

function historyReducer(state, action) {
  switch (action.type) {
    case 'TYPE': {
      if (action.value === state.present) return state;
      const groupTyping = state.lastAction === 'typing' && action.at - state.typedAt < 700;

      return {
        past: groupTyping ? state.past : limitHistory([...state.past, state.present]),
        present: action.value,
        future: [],
        lastAction: 'typing',
        typedAt: action.at,
      };
    }
    case 'SET':
      if (action.value === state.present) return state;
      return {
        past: limitHistory([...state.past, state.present]),
        present: action.value,
        future: [],
        lastAction: action.source || 'command',
        typedAt: 0,
      };
    case 'UNDO': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastAction: 'undo',
        typedAt: 0,
      };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      const [next, ...future] = state.future;
      return {
        past: limitHistory([...state.past, state.present]),
        present: next,
        future,
        lastAction: 'redo',
        typedAt: 0,
      };
    }
    case 'HYDRATE':
      return {
        past: [],
        present: action.value,
        future: [],
        lastAction: 'hydrate',
        typedAt: 0,
      };
    default:
      return state;
  }
}

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const isValidPreset = (preset) => preset
  && typeof preset.id === 'string'
  && typeof preset.name === 'string'
  && Array.isArray(preset.steps);

function useDialogFocus(onClose) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => (dialog.querySelector('[autofocus]') || dialog.querySelector(focusableSelector))?.focus();
    const frame = requestAnimationFrame(focusFirst);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return dialogRef;
}

function CommandChip({ command, onRun }) {
  return (
    <button className="command-chip" data-command-id={command.id} onClick={() => onRun(command.id)} title={command.description} type="button">
      <span className="command-label">{command.label}</span>
    </button>
  );
}

function TopCommandPanel({ activeTab, onTabChange, onRun, presets, onRunPreset, onCreatePreset, onEditPreset, onDeletePreset }) {
  const cleanupCommands = commandGroups
    .filter((group) => group.id === 'cleanup' || group.id === 'format')
    .flatMap((group) => group.commands);
  const sunoCommands = commandGroups.find((group) => group.id === 'suno')?.commands || [];
  const activeCommands = activeTab === 'cleanup' ? cleanupCommands : sunoCommands;
  const activePanelId = `commands-${activeTab}`;
  const stripRef = useRef(null);
  const [scrollState, setScrollState] = useState({ overflow: false, left: false, right: false });
  const scrollStrip = (direction) => stripRef.current?.scrollBy({ left: direction * 420, behavior: 'smooth' });

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;

    strip.scrollLeft = 0;
    const updateScrollState = () => {
      const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
      setScrollState({
        overflow: maxScroll > 2,
        left: strip.scrollLeft > 2,
        right: strip.scrollLeft < maxScroll - 2,
      });
    };

    const frame = requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(strip);
    strip.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      strip.removeEventListener('scroll', updateScrollState);
    };
  }, [activeTab, activeCommands.length, presets.length]);

  return (
    <section className="top-command-panel" aria-label="Команды редактора" data-testid="command-panel">
      <div className="command-panel-head">
        <div className="panel-tabs" role="tablist" aria-label="Категории">
          {[
            { id: 'cleanup', label: 'Очистка', icon: WandSparkles },
            { id: 'suno', label: 'Suno', icon: Music2 },
            { id: 'presets', label: 'Пресеты', icon: ListPlus },
          ].map(({ id, label, icon: Icon }) => (
            <button
              className={activeTab === id ? 'active' : ''}
              aria-controls={activePanelId}
              data-tab={id}
              id={`tab-${id}`}
              key={id}
              onClick={() => onTabChange(id)}
              role="tab"
              type="button"
              aria-selected={activeTab === id}
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>

        {scrollState.overflow && (
          <div className="command-scroll-controls" aria-label="Прокрутка команд">
            <button aria-label="Прокрутить команды влево" disabled={!scrollState.left} onClick={() => scrollStrip(-1)} type="button"><ChevronLeft size={16} /></button>
            <button aria-label="Прокрутить команды вправо" disabled={!scrollState.right} onClick={() => scrollStrip(1)} type="button"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div className={`command-strip-shell${scrollState.left ? ' can-scroll-left' : ''}${scrollState.right ? ' can-scroll-right' : ''}`}>
        <div
          aria-labelledby={`tab-${activeTab}`}
          className="command-strip"
          id={activePanelId}
          ref={stripRef}
          role="tabpanel"
          tabIndex={0}
        >
        {activeTab !== 'presets' ? (
          activeCommands.map((command) => <CommandChip command={command} key={command.id} onRun={onRun} />)
        ) : (
          <>
            <button className="new-preset-chip" data-action="new-preset" onClick={onCreatePreset} type="button">
              <Plus size={15} />
              Новый пресет
            </button>

            {presets.length === 0 ? (
              <button className="empty-preset-chip" data-action="new-preset-empty" onClick={onCreatePreset} type="button">
                <Sparkles size={16} />
                Создайте первую цепочку команд
              </button>
            ) : (
              presets.map((preset) => (
                <div className="preset-command-chip" key={preset.id}>
                  <button className="preset-run-button" data-preset-id={preset.id} onClick={() => onRunPreset(preset)} type="button">
                    <Play size={14} fill="currentColor" />
                    <span>
                      <strong>{preset.name}</strong>
                      <small>{preset.steps.length} команд</small>
                    </span>
                  </button>
                  <div className="preset-chip-actions">
                    <button aria-label={`Изменить пресет ${preset.name}`} onClick={() => onEditPreset(preset)} type="button">
                      <Pencil size={14} />
                    </button>
                    <button aria-label={`Удалить пресет ${preset.name}`} onClick={() => onDeletePreset(preset)} type="button">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
        </div>
      </div>
    </section>
  );
}

function SymbolBar({ items, onRemove }) {
  if (!items.length) return null;

  return (
    <section className="symbol-bar" aria-label="Обнаруженные токены" data-testid="symbol-bar">
      <div className="symbol-bar-label">
        <Hash size={14} />
        <strong>Символы</strong>
      </div>
      <div className="symbol-strip">
        {items.map(({ token }) => (
          <button className="symbol-chip" data-symbol-token={token} key={token} onClick={() => onRemove(token)} title={`Удалить все точные вхождения ${token}`} type="button">
            <code>{token}</code>
            <X aria-hidden="true" size={12} />
          </button>
        ))}
      </div>
    </section>
  );
}

function BottomToolbar({ canUndo, canRedo, hasText, onUndo, onRedo, onPaste, onCopy, onClear }) {
  const actions = [
    { id: 'undo', label: 'Отменить', icon: Undo2, onClick: onUndo, disabled: !canUndo, shortcut: 'Ctrl Z', variant: 'utility' },
    { id: 'redo', label: 'Повторить', icon: Redo2, onClick: onRedo, disabled: !canRedo, shortcut: 'Ctrl Y', variant: 'utility' },
    { id: 'paste', label: 'Вставить', icon: ClipboardPaste, onClick: onPaste, shortcut: 'Ctrl V', variant: 'primary' },
    { id: 'copy', label: 'Копировать', icon: Copy, onClick: onCopy, disabled: !hasText, shortcut: 'Ctrl C', variant: 'secondary' },
    { id: 'clear', label: 'Очистить', icon: Trash2, onClick: onClear, disabled: !hasText, variant: 'danger' },
  ];

  return (
    <nav className="bottom-toolbar" aria-label="Основные действия" data-testid="bottom-toolbar">
      <div className="toolbar-inner">
        {actions.map(({ id, label, icon: Icon, onClick, disabled, shortcut, variant }) => (
          <button className={`toolbar-action ${variant}`} data-action={id} disabled={disabled} key={id} onClick={onClick} title={`${label}${shortcut ? ` (${shortcut})` : ''}`} type="button">
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PresetModal({ preset, onClose, onSave }) {
  const [name, setName] = useState(preset?.name || '');
  const [steps, setSteps] = useState(preset?.steps || []);
  const isEditing = Boolean(preset);
  const dialogRef = useDialogFocus(onClose);

  const moveStep = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };

  const removeStep = (index) => setSteps((current) => current.filter((_, currentIndex) => currentIndex !== index));

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !steps.length) return;
    onSave({ id: preset?.id || makeId(), name: trimmedName, steps });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <form aria-labelledby="preset-dialog-title" aria-modal="true" className="preset-modal" data-testid="preset-dialog" onSubmit={submit} ref={dialogRef} role="dialog">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Цепочка команд</span>
            <h2 id="preset-dialog-title">{isEditing ? 'Изменить пресет' : 'Новый пресет'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Закрыть"><X size={19} /></button>
        </div>

        <label className="name-field">
          <span>Название</span>
          <input autoFocus maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="Например, Suno Ready" value={name} />
        </label>

        <div className="builder-layout">
          <div className="available-commands">
            <div className="builder-title">Добавить команду</div>
            {commandGroups.map((group) => (
              <div className="builder-group" key={group.id}>
                <span>{group.label}</span>
                <div>
                  {group.commands.map((command) => (
                    <button key={command.id} onClick={() => setSteps((current) => [...current, command.id])} type="button">
                      <Plus size={13} />
                      {command.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="chain-builder">
            <div className="builder-title">Цепочка <span>{steps.length}</span></div>
            {steps.length ? (
              <ol className="chain-list">
                {steps.map((id, index) => (
                  <li key={`${id}-${index}`}>
                    <span className="step-number">{index + 1}</span>
                    <span className="step-name">{commandById[id]?.label || id}</span>
                    <span className="step-controls">
                      <button disabled={index === 0} onClick={() => moveStep(index, -1)} type="button" aria-label="Поднять"><ArrowUp size={14} /></button>
                      <button disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} type="button" aria-label="Опустить"><ArrowDown size={14} /></button>
                      <button onClick={() => removeStep(index)} type="button" aria-label="Удалить"><X size={14} /></button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-chain">Выберите команды слева. Они выполнятся сверху вниз.</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose} type="button">Отмена</button>
          <button className="primary-button" disabled={!name.trim() || !steps.length} type="submit">
            <Save size={16} />
            Сохранить пресет
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDialog({ title, description, actionLabel, onCancel, onConfirm }) {
  const dialogRef = useDialogFocus(onCancel);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()} role="presentation">
      <div className="confirm-dialog" data-testid="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" ref={dialogRef}>
        <span className="confirm-icon"><Trash2 size={20} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div>
          <button className="secondary-button" onClick={onCancel} type="button">Отмена</button>
          <button className="danger-button" onClick={onConfirm} type="button">{actionLabel}</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, createHistory);
  const [activeTab, setActiveTab] = useState('cleanup');
  const [presets, setPresets] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [editingPreset, setEditingPreset] = useState(undefined);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const textareaRef = useRef(null);
  const toastTimerRef = useRef(null);
  const text = history.present;

  const stats = useMemo(() => ({
    characters: Array.from(text).length,
    words: text.trim() ? text.trim().split(/\s+/u).length : 0,
    lines: text ? normalizeLineCount(text) : 0,
  }), [text]);

  const analyzedSymbols = useMemo(() => analyzeSymbols(text), [text]);

  const notify = (message) => {
    clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  };

  const setText = (value, source = 'command') => dispatch({ type: 'SET', value, source });

  const focusEditor = () => requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));

  const runCommand = (id) => {
    const next = applyCommand(id, text);
    if (next === text) {
      notify('Изменений нет');
      return;
    }
    setText(next, id);
    notify(`${commandById[id]?.label || 'Команда'} выполнено`);
    focusEditor();
  };

  const runPreset = (preset) => {
    const validSteps = preset.steps.filter((id) => commandById[id]);
    const next = applyChain(validSteps, text);
    if (next === text) {
      notify('Пресет не изменил текст');
      return;
    }
    setText(next, `preset:${preset.id}`);
    notify(`Пресет «${preset.name}» выполнен`);
    focusEditor();
  };

  const openCreatePreset = () => {
    setEditingPreset(undefined);
    setShowPresetModal(true);
  };

  const openEditPreset = (preset) => {
    setEditingPreset(preset);
    setShowPresetModal(true);
  };

  const savePreset = (preset) => {
    setPresets((current) => {
      const exists = current.some((item) => item.id === preset.id);
      return exists ? current.map((item) => (item.id === preset.id ? preset : item)) : [...current, preset];
    });
    setShowPresetModal(false);
    notify('Пресет сохранён');
  };

  const requestDeletePreset = (preset) => setConfirmation({
    title: `Удалить «${preset.name}»?`,
    description: 'Цепочка команд будет удалена без возможности восстановления.',
    actionLabel: 'Удалить',
    onConfirm: () => {
      setPresets((current) => current.filter((item) => item.id !== preset.id));
      setConfirmation(null);
      notify('Пресет удалён');
    },
  });

  const pasteText = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? text.length;
      const end = textarea?.selectionEnd ?? text.length;
      setText(`${text.slice(0, start)}${clipboardText}${text.slice(end)}`, 'paste');
      notify('Текст вставлен');
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const caret = start + clipboardText.length;
        textareaRef.current?.setSelectionRange(caret, caret);
      });
    } catch {
      notify('Разрешите доступ к буферу обмена');
      textareaRef.current?.focus();
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Текст скопирован');
    } catch {
      textareaRef.current?.select();
      notify('Выделено — нажмите Ctrl+C');
    }
  };

  const requestClear = () => setConfirmation({
    title: 'Очистить редактор?',
    description: 'Весь текущий текст будет удалён. Действие можно отменить кнопкой Undo.',
    actionLabel: 'Очистить',
    onConfirm: () => {
      setText('', 'clear');
      setConfirmation(null);
      notify('Редактор очищен');
      focusEditor();
    },
  });

  const removeToken = (token) => {
    const next = removeSymbolToken(text, token);
    setText(next, `symbol:${token}`);
    notify(`Токен ${token} удалён`);
    focusEditor();
  };

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  useEffect(() => {
    const storedDraft = readStoredValue(DRAFT_KEY, '');
    const storedPresets = readStoredValue(PRESETS_KEY, []);
    dispatch({ type: 'HYDRATE', value: typeof storedDraft === 'string' ? storedDraft : '' });
    setPresets(Array.isArray(storedPresets) ? storedPresets.filter(isValidPreset) : []);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return undefined;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(text));
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [storageReady, text]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [presets, storageReady]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const registerWorker = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.addEventListener('load', registerWorker);
    if (document.readyState === 'complete') registerWorker();
    return () => window.removeEventListener('load', registerWorker);
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: 'UNDO' });
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#editor" aria-label="Edit — перейти к редактору">
          <span className="brand-mark">E</span>
          <span className="brand-name">Edit</span>
        </a>

        <div className="header-status">
          <span className={`saved-status ${saveStatus}`} data-testid="save-status" role="status">
            <Check size={14} />
            {saveStatus === 'saving' ? 'Сохранение…' : saveStatus === 'error' ? 'Не сохранено' : 'Сохранено'}
          </span>
          {installPrompt && (
            <button className="install-button" onClick={installApp} type="button">
              <Download size={15} />
              Установить
            </button>
          )}
        </div>
      </header>

      <main className="workspace">
        <TopCommandPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRun={runCommand}
          presets={presets}
          onRunPreset={runPreset}
          onCreatePreset={openCreatePreset}
          onEditPreset={openEditPreset}
          onDeletePreset={requestDeletePreset}
        />

        <div className="editor-stage">
          <section className="editor-card" data-testid="editor-card" id="editor">
            <div className="editor-header">
              <strong className="editor-label">Редактор</strong>
              <div className="text-stats" aria-label="Статистика текста">
                <span><strong>{stats.characters}</strong> знаков</span>
                <span><strong>{stats.words}</strong> слов</span>
                <span><strong>{stats.lines}</strong> строк</span>
              </div>
            </div>

            <div className="textarea-wrap">
              <textarea
                aria-label="Редактор текста"
                data-testid="text-editor"
                onChange={(event) => dispatch({ type: 'TYPE', value: event.target.value, at: Date.now() })}
                placeholder={'Начните писать или вставьте текст…\n\n[Verse 1]\nКаждая строка останется на своём месте.'}
                ref={textareaRef}
                spellCheck="false"
                value={text}
              />
            </div>
          </section>

          <SymbolBar items={analyzedSymbols} onRemove={removeToken} />
        </div>
      </main>

      <BottomToolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        hasText={Boolean(text)}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onPaste={pasteText}
        onCopy={copyText}
        onClear={requestClear}
      />

      {showPresetModal && (
        <PresetModal preset={editingPreset} onClose={() => setShowPresetModal(false)} onSave={savePreset} />
      )}

      {confirmation && (
        <ConfirmDialog {...confirmation} onCancel={() => setConfirmation(null)} />
      )}

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function normalizeLineCount(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').length;
}

export default App;
