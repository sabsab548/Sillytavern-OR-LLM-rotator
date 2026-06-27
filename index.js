/**
 * LLM Rotator - SillyTavern Extension
 * Intercepts chat completion calls and swaps the model parameter
 * from a configurable rotation list. Does NOT touch API key or URL.
 */

import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';

import { extension_settings, getContext } from '../../../extensions.js';

const EXT_NAME = 'llm-rotator';

// ── Default settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
    enabled: true,
    mode: 'sequential',          // 'sequential' | 'random'
    models: [
        'google/gemini-2.5-pro',
        'anthropic/claude-sonnet-4-5',
        'openai/gpt-4o',
    ],
    currentIndex: 0,
};

// ── State ─────────────────────────────────────────────────────────────────────
let lastUsedModel = null;

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    return extension_settings[EXT_NAME];
}

function nextModel() {
    const s = getSettings();
    if (!s.models.length) return null;

    let idx;
    if (s.mode === 'random') {
        idx = Math.floor(Math.random() * s.models.length);
    } else {
        idx = s.currentIndex % s.models.length;
        s.currentIndex = (idx + 1) % s.models.length;
        saveSettingsDebounced();
    }
    return s.models[idx];
}

// ── Intercept ─────────────────────────────────────────────────────────────────
// CHAT_COMPLETION_SETTINGS_READY passes the settings object by reference —
// mutating settings.model here is enough; the API call picks it up.
eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, (settings) => {
    const s = getSettings();
    if (!s.enabled || !s.models.length) return;

    const chosen = nextModel();
    if (!chosen) return;

    console.log(`[LLM Rotator] Swapping model → ${chosen} (was: ${settings.model})`);
    settings.model = chosen;
    lastUsedModel = chosen;

    // Update the status badge in our panel
    updateCurrentModelDisplay(chosen);
});

// ── Timestamp patch ───────────────────────────────────────────────────────────
eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    if (!lastUsedModel) return;

    const messages = document.querySelectorAll('.mes[is_user="false"]:not([is_system="true"])');
    const last = messages[messages.length - 1];
    if (!last) return;

    const title = lastUsedModel;
    const timestamp = last.querySelector('.timestamp');
    if (timestamp) timestamp.setAttribute('title', title);
    const svgTitle = last.querySelector('.timestamp-icon title');
    if (svgTitle) svgTitle.textContent = title;

    lastUsedModel = null;
});

// ── UI ────────────────────────────────────────────────────────────────────────
const PANEL_HTML = /* html */ `
<div id="llm-rotator-panel">
    <div class="llm-rotator-header">
        <span class="llm-rotator-title">🔄 LLM Rotator</span>
        <label class="llm-rotator-toggle" title="Enable/disable rotation">
            <input type="checkbox" id="llmr-enabled" />
            <span class="llmr-slider"></span>
        </label>
    </div>

    <div class="llm-rotator-row">
        <span class="llmr-label">Mode</span>
        <select id="llmr-mode">
            <option value="sequential">Sequential</option>
            <option value="random">Random</option>
        </select>
    </div>

    <div class="llm-rotator-row">
        <span class="llmr-label">Next call will use</span>
        <span id="llmr-current-model" class="llmr-current">—</span>
    </div>

    <div class="llmr-model-list-label">Model list <span class="llmr-hint">(one per line)</span></div>
    <textarea id="llmr-model-list" rows="6" spellcheck="false"></textarea>

    <div class="llm-rotator-actions">
        <button id="llmr-save" class="menu_button">Save</button>
        <button id="llmr-reset-index" class="menu_button" title="Restart rotation from first model">↩ Reset</button>
    </div>
</div>
`;

const PANEL_CSS = /* css */ `
#llm-rotator-panel {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
}
.llm-rotator-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}
.llm-rotator-title {
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.02em;
}
.llm-rotator-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.llmr-label {
    color: var(--SmartThemeBodyColor);
    opacity: 0.75;
    white-space: nowrap;
}
.llmr-current {
    font-family: monospace;
    font-size: 12px;
    color: var(--SmartThemeQuoteColor, #7ec8e3);
    text-align: right;
    word-break: break-all;
    max-width: 220px;
}
#llmr-mode {
    background: var(--SmartThemeBlurTintColor);
    color: var(--SmartThemeBodyColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 12px;
    cursor: pointer;
}
.llmr-model-list-label {
    font-weight: 500;
    margin-top: 4px;
}
.llmr-hint {
    font-size: 11px;
    opacity: 0.55;
    font-weight: 400;
}
#llmr-model-list {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-family: monospace;
    font-size: 12px;
    background: var(--SmartThemeBlurTintColor);
    color: var(--SmartThemeBodyColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 4px;
    padding: 6px 8px;
    line-height: 1.6;
}
.llm-rotator-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
}
.llm-rotator-actions .menu_button {
    padding: 4px 14px;
    font-size: 12px;
    min-width: unset;
}

/* Toggle switch */
.llm-rotator-toggle {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 20px;
    cursor: pointer;
}
.llm-rotator-toggle input { opacity: 0; width: 0; height: 0; }
.llmr-slider {
    position: absolute;
    inset: 0;
    background: var(--SmartThemeBorderColor);
    border-radius: 20px;
    transition: background 0.2s;
}
.llmr-slider::before {
    content: '';
    position: absolute;
    height: 14px; width: 14px;
    left: 3px; top: 3px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
}
.llm-rotator-toggle input:checked + .llmr-slider {
    background: var(--SmartThemeQuoteColor, #4caf50);
}
.llm-rotator-toggle input:checked + .llmr-slider::before {
    transform: translateX(18px);
}
`;

function updateCurrentModelDisplay(model) {
    const el = document.getElementById('llmr-current-model');
    if (el) el.textContent = model || '—';
}

function populateUI() {
    const s = getSettings();

    const enabledCb = document.getElementById('llmr-enabled');
    const modeSelect = document.getElementById('llmr-mode');
    const textarea = document.getElementById('llmr-model-list');

    if (enabledCb) enabledCb.checked = s.enabled;
    if (modeSelect) modeSelect.value = s.mode;
    if (textarea) textarea.value = s.models.join('\n');

    // Show which model would fire next
    const previewIdx = s.currentIndex % Math.max(s.models.length, 1);
    const preview = s.mode === 'random' ? '(random)' : (s.models[previewIdx] || '—');
    updateCurrentModelDisplay(preview);
}

function bindUIEvents() {
    document.getElementById('llmr-enabled')?.addEventListener('change', (e) => {
        getSettings().enabled = e.target.checked;
        saveSettingsDebounced();
    });

    document.getElementById('llmr-mode')?.addEventListener('change', (e) => {
        const s = getSettings();
        s.mode = e.target.value;
        saveSettingsDebounced();
        populateUI();
    });

    document.getElementById('llmr-save')?.addEventListener('click', () => {
        const s = getSettings();
        const raw = document.getElementById('llmr-model-list')?.value ?? '';
        s.models = raw
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
        s.currentIndex = 0;   // reset on save so rotation starts clean
        saveSettingsDebounced();
        populateUI();

        // brief visual feedback
        const btn = document.getElementById('llmr-save');
        if (btn) { btn.textContent = '✓ Saved'; setTimeout(() => btn.textContent = 'Save', 1200); }
    });

    document.getElementById('llmr-reset-index')?.addEventListener('click', () => {
        getSettings().currentIndex = 0;
        saveSettingsDebounced();
        populateUI();
    });
}

// ── Extension entry point ──────────────────────────────────────────────────────
jQuery(async () => {
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    // Register drawer in the Extensions panel (standard ST pattern)
    const settingsHtml = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>LLM Rotator</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${PANEL_HTML}
            </div>
        </div>`;

    $('#extensions_settings').append(settingsHtml);

    populateUI();
    bindUIEvents();

    console.log('[LLM Rotator] Extension loaded.');
});
