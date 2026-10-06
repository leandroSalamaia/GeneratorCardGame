import { extendImportedCards } from './importArt.js';
import { artSources } from './artVariants.js';
import { OPENAI_TRANSLATION_MODELS } from './translationModels.js';
import { CardState, CARD_TYPES, CARD_TYPE_NAMES, getCardTypeName, SPHERES, SPHERE_NAMES, getSphereName, DEFAULT_PRESETS, DEFAULT_QUEST_ART_CONFIG } from './cardState.js';
import { CardRenderer } from './renderer.js';
import { PdfProxyExporter } from './pdfExporter.js';
import { ImageBatchExporter } from './imageExporter.js';
import { getTranslationSettings, saveTranslationSettings, translateSingleCard, translateCardsBatch, DEFAULT_MODELS, PROVIDERS } from './translator.js';

document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('lotr-storage-error', event => {
    let warning = document.getElementById('storage-warning');
    if (!warning) {
      warning = document.createElement('div'); warning.id = 'storage-warning';
      warning.setAttribute('role', 'alert');
      warning.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:10000;background:#713f12;color:white;padding:12px;border-radius:8px;max-width:460px';
      document.body.appendChild(warning);
    }
    warning.textContent = event.detail;
  });
  const canvas = document.getElementById('card-canvas');
  const cardState = new CardState();
  await cardState.initializeStorage();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cardState.flushStorage();
  });
  window.addEventListener('pagehide', () => cardState.flushStorage());
  window.addEventListener('lotr-storage-saved', () => document.getElementById('storage-warning')?.remove());
  const renderer = new CardRenderer(canvas);
  const pdfExporter = new PdfProxyExporter(renderer);
  const imageExporter = new ImageBatchExporter(renderer);

  // Initialize Renderer & Assets
  await renderer.initialize();

  const layoutTitle = document.getElementById('layout-preset-title');
  const layoutStatus = document.getElementById('layout-preset-status');
  const btnSaveLayout = document.getElementById('btn-save-type-layout');
  const btnApplyLayout = document.getElementById('btn-apply-type-layout');
  const btnRemoveLayout = document.getElementById('btn-remove-type-layout');

  function syncLayoutControls(message = '', error = false) {
    const type = cardState.currentCard.type;
    const label = getCardTypeName(type);
    const saved = Boolean(cardState.layoutPresets[type]);
    layoutTitle.textContent = `Layout de ${label}`;
    btnSaveLayout.textContent = `${saved ? 'Atualizar' : 'Salvar'} layout de ${label}`;
    btnApplyLayout.disabled = !saved;
    btnRemoveLayout.disabled = !saved;
    layoutStatus.dataset.error = String(error);
    layoutStatus.textContent = message || (saved
      ? 'Layout salvo. Usado nas próximas importações e modelos deste tipo.'
      : 'Nenhum layout salvo para este tipo.');
  }

  async function fillMissingQuestArt() {
    const card = cardState.currentCard;
    if (card.type !== CARD_TYPES.QUEST) return;
    const reference = card.originalProxyArt || card.customArt;
    const letter = (card.questLetter || card.questSide || 'a').toUpperCase();
    const firstLetter = String.fromCharCode(letter.charCodeAt(0) - (card.questSide === 'b' ? 1 : 0));
    for (const side of ['a', 'b']) {
      // Looking for the reverse must not replace the image being positioned.
      if (side === (card.questSide || 'a')) continue;
      const slotName = 'questArt' + side.toUpperCase();
      const target = card.questSides?.[side];
      const slot = card[slotName];
      if (target?.customArt || slot?.customArt || (card.questSide === side && card.customArt)) continue;
      const params = new URLSearchParams({ name: card.originalName || card.name, set: card.cardSet || '',
        stage: card.stage || '1', side: String.fromCharCode(firstLetter.charCodeAt(0) + (side === 'b' ? 1 : 0)).toLowerCase(), reference: reference || '' });
      const response = await fetch('/api/find-local-art?' + params);
      if (!response.ok) throw Error('Não foi possível procurar a arte da outra face.');
      const result = await response.json();
      if (cardState.currentCard !== card) return;
      if (!result.found) continue;
      const artSlot = { ...slot, customArt: result.url, originalProxyArt: result.url,
        art: { ...(slot?.art || card.art), sourceKind: 'card' } };
      card[slotName] = artSlot;
      if (target) Object.assign(target, structuredClone(artSlot));
      if (card.questSide === side) Object.assign(card, structuredClone(artSlot));
      for (const nested of Object.values(card.questSides || {})) nested[slotName] = structuredClone(artSlot);
    }
    cardState.notify('art');
  }

  btnSaveLayout.addEventListener('click', async () => {
    try {
      cardState.saveCurrentLayout();
      syncFormWithState();
      await cardState.flushStorage();
      syncLayoutControls(`Layout de ${getCardTypeName(cardState.currentCard.type)} salvo neste navegador. Será usado nas próximas importações e modelos deste tipo.`);
    } catch {
      syncLayoutControls('Não foi possível salvar o layout. Verifique o espaço disponível no navegador.', true);
    }
  });
  btnApplyLayout.addEventListener('click', async () => {
    if (cardState.applyCurrentLayout()) {
      syncFormWithState();
      try { await fillMissingQuestArt(); } catch (error) { syncLayoutControls(error.message, true); return; }
      syncLayoutControls(cardState.currentCard.type === 'quest' ? 'Layout aplicado aos dois lados da missão.' : 'Layout aplicado à carta atual.');
    }
  });
  btnRemoveLayout.addEventListener('click', () => {
    try {
      cardState.removeCurrentLayout();
      syncLayoutControls('Layout salvo excluído. As posições da carta atual foram mantidas.');
    } catch {
      syncLayoutControls('Não foi possível excluir o layout salvo.', true);
    }
  });

  // Elements: Header Actions
  const btnOpenTranslationSettings = document.getElementById('btn-open-translation-settings');
  const btnOpenImporter = document.getElementById('btn-open-importer');
  const btnDownloadPng = document.getElementById('btn-download-png');
  const btnAddToDeck = document.getElementById('btn-add-to-deck');
  const btnSaveCard = document.getElementById('btn-save-card');
  const btnOpenDeck = document.getElementById('btn-open-deck');
  const deckCountBadge = document.getElementById('deck-count');

  // Elements: Translation Settings Modal
  const modalTranslationSettings = document.getElementById('modal-translation-settings');
  const btnCloseTranslationSettings = document.getElementById('btn-close-translation-settings');
  const providerGoogle = document.getElementById('provider-google');
  const providerOpenai = document.getElementById('provider-openai');
  const inputApiKey = document.getElementById('input-api-key');
  const apiKeyHelp = document.getElementById('api-key-help');
  const selectAiModel = document.getElementById('select-ai-model');
  const btnTestTranslation = document.getElementById('btn-test-translation');
  const btnSaveTranslationSettings = document.getElementById('btn-save-translation-settings');
  const translationStatusMsg = document.getElementById('translation-status-msg');

  // Elements: Translation Buttons
  const btnTranslateCard = document.getElementById('btn-translate-card');
  const btnTranslateImported = document.getElementById('btn-translate-imported');

  // Elements: Quick Single Card Import (Tab 2)
  const inputQuickSingleCard = document.getElementById('input-quick-single-card');
  const btnQuickImportSingle = document.getElementById('btn-quick-import-single');

  // Elements: Hall of Beorn Importer Modal
  const modalImporter = document.getElementById('modal-importer');
  const btnCloseImporter = document.getElementById('btn-close-importer');
  const inputHobUrl = document.getElementById('input-hob-url');
  const btnStartImport = document.getElementById('btn-start-import');
  const quickExpBtns = document.querySelectorAll('.btn-quick-exp');
  const importerStatusBox = document.getElementById('importer-status-box');
  const importerStatusText = document.getElementById('importer-status-text');
  const importerCountBadge = document.getElementById('importer-count-badge');
  const importerProgressBar = document.getElementById('importer-progress-bar');
  const importedResultsHeader = document.getElementById('imported-results-header');
  const importedExpansionTitle = document.getElementById('imported-expansion-title');
  const importedCardsGrid = document.getElementById('imported-cards-grid');
  const btnSelectAllImported = document.getElementById('btn-select-all-imported');
  const btnExportImportedZip = document.getElementById('btn-export-imported-zip');
  const btnAddImportedToDeck = document.getElementById('btn-add-imported-to-deck');
  const btnSaveImportedToLib = document.getElementById('btn-save-imported-to-lib');

  let importedCardsList = [];
  let selectedImportedIds = new Set();

  // Elements: Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Elements: Type & Sphere
  const typeBtns = document.querySelectorAll('.type-card-btn');
  const sphereBtns = document.querySelectorAll('.sphere-btn');
  const playerControls = document.getElementById('player-controls');
  const enemyControls = document.getElementById('enemy-controls');
  const encounterControls = document.getElementById('encounter-controls');
  const questControls = document.getElementById('quest-controls');
  const costRow = document.getElementById('cost-row');
  const heroStatsRow = document.getElementById('hero-stats-row');
  const heroBannerContainer = document.getElementById('hero-banner-container');
  const inputHeroBanner = document.getElementById('input-hero-banner');
  const threatCostCol = document.getElementById('threat-cost-col');
  const locationStatsRow = document.getElementById('location-stats-row');
  const uniqueToggleContainer = document.getElementById('unique-toggle-container');
  const shadowToggleContainer = document.getElementById('shadow-toggle-container');

  // Elements: Inputs
  const inputCost = document.getElementById('input-cost');
  const inputUnique = document.getElementById('input-unique');
  const inputThreatCost = document.getElementById('input-threat-cost');
  const inputHeroWillpower = document.getElementById('input-hero-willpower');
  const inputHeroAttack = document.getElementById('input-hero-attack');
  const inputHeroDefense = document.getElementById('input-hero-defense');
  const inputHeroHealth = document.getElementById('input-hero-health');

  const inputEngagementThreat = document.getElementById('input-engagement-threat');
  const inputEnemyThreat = document.getElementById('input-enemy-threat');
  const inputEnemyAttack = document.getElementById('input-enemy-attack');
  const inputEnemyDefense = document.getElementById('input-enemy-defense');
  const inputEnemyHealth = document.getElementById('input-enemy-health');

  const inputThreat = document.getElementById('input-threat');
  const inputQuestPoints = document.getElementById('input-quest-points');
  const inputVictory = document.getElementById('input-victory');
  const scenarioNameContainer = document.getElementById('scenario-name-container');
  const inputScenarioName = document.getElementById('input-scenario-name');
  const selectEncounterSet = document.getElementById('select-encounter-set');
  const inputCardNumber = document.getElementById('input-card-number');
  const inputHasShadow = document.getElementById('input-has-shadow');

  const inputStageTitle = document.getElementById('input-stage-title');
  const inputQuestSide = document.getElementById('input-quest-side');
  const questSideBtns = document.querySelectorAll('.quest-side-btn');
  const inputQuestStage = document.getElementById('input-quest-stage');
  const inputQuestLetter = document.getElementById('input-quest-letter');
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    inputQuestLetter.add(new Option(letter, letter));
  }
  inputQuestLetter.addEventListener('change', () => cardState.updateField('questLetter', inputQuestLetter.value));
  const inputQuestScenarioName = document.getElementById('input-quest-scenario-name');
  const inputQuestPointsSideB = document.getElementById('input-quest-points-side-b');
  const inputQuestVictory = document.getElementById('input-quest-victory');
  const questBStatsRow = document.getElementById('quest-b-stats-row');
  const btnFlipQuest = document.getElementById('btn-flip-quest');
  const canvasDimBadge = document.getElementById('canvas-dim-badge');

  // Elements: Text inputs
  const inputName = document.getElementById('input-name');
  const inputTraits = document.getElementById('input-traits');
  const inputAbility = document.getElementById('input-ability');
  const inputShadow = document.getElementById('input-shadow');
  const inputQuote = document.getElementById('input-quote');
  const inputIllustrator = document.getElementById('input-illustrator');
  const inputCopyright = document.getElementById('input-copyright');
  const shadowTextGroup = document.getElementById('shadow-text-group');
  const quoteTextGroup = document.getElementById('quote-text-group');

  // Elements: Art Controls & Tools
  const artDropzone = document.getElementById('art-dropzone');
  const inputArtFile = document.getElementById('input-art-file');
  const btnUseSampleArt = document.getElementById('btn-use-sample-art');
  const btnModeMove = document.getElementById('btn-mode-move');
  const btnModeEraser = document.getElementById('btn-mode-eraser');
  const eraserToolBox = document.getElementById('eraser-tool-box');
  const sliderEraserSize = document.getElementById('slider-eraser-size');
  const valEraserSize = document.getElementById('val-eraser-size');
  const btnEraserUndo = document.getElementById('btn-eraser-undo');
  const btnEraserClear = document.getElementById('btn-eraser-clear');
  const sliderScaleX = document.getElementById('slider-scale-x');
  const btnScaleXMinus = document.getElementById('btn-scale-x-minus');
  const btnScaleXPlus = document.getElementById('btn-scale-x-plus');
  const inputScaleXVal = document.getElementById('input-scale-x-val');

  const sliderScaleY = document.getElementById('slider-scale-y');
  const btnScaleYMinus = document.getElementById('btn-scale-y-minus');
  const btnScaleYPlus = document.getElementById('btn-scale-y-plus');
  const inputScaleYVal = document.getElementById('input-scale-y-val');

  const btnToggleRatioLock = document.getElementById('btn-toggle-ratio-lock');
  const ratioLockIcon = document.getElementById('ratio-lock-icon');
  const ratioLockText = document.getElementById('ratio-lock-text');
  const btnEqualizeScale = document.getElementById('btn-equalize-scale');

  const quickZoomBtns = document.querySelectorAll('.btn-zoom-preset');
  const sliderPosX = document.getElementById('slider-pos-x');
  const sliderPosY = document.getElementById('slider-pos-y');
  const sliderRotation = document.getElementById('slider-rotation');
  document.querySelectorAll('[data-rotate-art]').forEach(button => {
    button.addEventListener('click', () => {
      const art = cardState.currentCard.art || {};
      const field = art.sourceKind === 'card' ? 'sourceRotation' : 'rotation';
      const angle = Number(art[field] || 0) + Number(button.dataset.rotateArt);
      cardState.updateArt({ [field]: ((angle + 180) % 360 + 360) % 360 - 180 });
      syncFormWithState();
    });
  });
  const sliderBottomFade = document.getElementById('slider-bottom-fade');
  const sliderFeather = document.getElementById('slider-feather');
  const sliderBrightness = document.getElementById('slider-brightness');
  const sliderContrast = document.getElementById('slider-contrast');
  const btnFrameQuestTopRight = document.getElementById('btn-frame-quest-top-right');
  const btnFrameQuestCenter = document.getElementById('btn-frame-quest-center');
  const btnFrameFit = document.getElementById('btn-frame-fit');
  const btnSyncArtSides = document.getElementById('btn-sync-art-sides');
  const btnResetArt = document.getElementById('btn-reset-art');
  const proxyFramingControls = document.getElementById('proxy-framing-controls');
  const inputProxyAlignment = document.getElementById('input-proxy-alignment');
  const btnRestoreProxyFraming = document.getElementById('btn-restore-proxy-framing');

  // Elements: Stat Position Offsets
  const offsetHealthX = document.getElementById('offset-health-x');
  const offsetHealthY = document.getElementById('offset-health-y');
  const offsetCostX = document.getElementById('offset-cost-x');
  const offsetCostY = document.getElementById('offset-cost-y');
  const offsetWillpowerX = document.getElementById('offset-willpower-x');
  const offsetWillpowerY = document.getElementById('offset-willpower-y');
  const offsetAttackX = document.getElementById('offset-attack-x');
  const offsetAttackY = document.getElementById('offset-attack-y');
  const offsetDefenseX = document.getElementById('offset-defense-x');
  const offsetDefenseY = document.getElementById('offset-defense-y');
  const offsetQuestPointsX = document.getElementById('offset-quest-points-x');
  const offsetQuestPointsY = document.getElementById('offset-quest-points-y');
  const offsetTypeX = document.getElementById('offset-type-x');
  const offsetTypeY = document.getElementById('offset-type-y');
  const offsetHeroTypeX = document.getElementById('offset-hero-type-x');
  const offsetHeroTypeY = document.getElementById('offset-hero-type-y');
  const offsetNameX = document.getElementById('offset-name-x');
  const offsetNameY = document.getElementById('offset-name-y');
  const offsetFlavorTextX = document.getElementById('offset-flavor-text-x');
  const offsetFlavorTextY = document.getElementById('offset-flavor-text-y');
  const btnResetOffsets = document.getElementById('btn-reset-offsets');

  const valPosX = document.getElementById('val-pos-x');
  const valPosY = document.getElementById('val-pos-y');
  const valRotation = document.getElementById('val-rotation');
  const valBottomFade = document.getElementById('val-bottom-fade');
  const valFeather = document.getElementById('val-feather');
  const valBrightness = document.getElementById('val-brightness');
  const valContrast = document.getElementById('val-contrast');

  // Elements: Preview Stage & Zoom
  const dragOverlay = document.getElementById('drag-overlay');
  const eraserCursorPreview = document.getElementById('eraser-cursor-preview');
  const cardWrapper = document.getElementById('card-wrapper');
  const cardViewport = document.getElementById('card-viewport');
  const zoomBtns = document.querySelectorAll('.btn-zoom');

  // Elements: Deck Modal
  const modalDeck = document.getElementById('modal-deck');
  const btnCloseDeck = document.getElementById('btn-close-deck');
  const btnClearDeck = document.getElementById('btn-clear-deck');
  const btnExportDeckImages = document.getElementById('btn-export-deck-images');
  const btnGeneratePdf = document.getElementById('btn-generate-pdf');
  const modalTotalCards = document.getElementById('modal-total-cards');
  const modalTotalPages = document.getElementById('modal-total-pages');
  const deckGrid = document.getElementById('deck-grid');
  const chkCutMarks = document.getElementById('chk-cut-marks');
  const chkHighQuality = document.getElementById('chk-high-quality');
  const chkZipDuplicates = document.getElementById('chk-zip-duplicates');

  // Elements: Presets & Library
  const presetsList = document.getElementById('presets-list');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnImportJsonTrigger = document.getElementById('btn-import-json-trigger');
  const inputImportJson = document.getElementById('input-import-json');

  // 1. Populate Encounter Sets
  if (renderer.manifest && renderer.manifest.encounterSets) {
    selectEncounterSet.innerHTML = '';
    renderer.manifest.encounterSets.forEach(enc => {
      const opt = document.createElement('option');
      opt.value = enc.id;
      opt.textContent = enc.name;
      selectEncounterSet.appendChild(opt);
    });
  }



  // 3. Tab Navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 4. Tag Toolbar
  document.querySelectorAll('.btn-tag').forEach(tagBtn => {
    tagBtn.addEventListener('click', () => {
      const tag = tagBtn.dataset.tag;
      const start = inputAbility.selectionStart;
      const end = inputAbility.selectionEnd;
      const text = inputAbility.value;

      if (tag.includes('><')) {
        // Pairing tag like <b></b>
        const openTag = tag.substring(0, 3);
        const closeTag = tag.substring(3);
        const selected = text.substring(start, end) || 'texto';
        inputAbility.value = text.substring(0, start) + openTag + selected + closeTag + text.substring(end);
      } else {
        inputAbility.value = text.substring(0, start) + tag + text.substring(end);
      }
      cardState.updateField('ability', inputAbility.value);
      inputAbility.focus();
    });
  });

  // 5. Sync Form with Card State
  const selectArtSource = document.getElementById('select-art-source');
  selectArtSource.addEventListener('change', () => {
    cardState.selectArtSource(selectArtSource.value);
    syncFormWithState();
  });

  function syncFormWithState() {
    syncLayoutControls();
    proxyFramingControls.classList.toggle('hidden', cardState.currentCard.art?.sourceKind !== 'card');
    inputProxyAlignment.checked = cardState.currentCard.art?.proxyAlignment !== false;
    const card = cardState.currentCard;
    const sources = artSources(card);
    document.getElementById('art-source-controls').classList.toggle('hidden', !sources.original && !sources.generated);
    selectArtSource.querySelector('[value="original"]').disabled = !sources.original;
    selectArtSource.querySelector('[value="generated"]').disabled = !sources.generated;
    selectArtSource.value = card.customArt && card.customArt === sources.original ? 'original'
      : card.customArt && card.customArt === sources.generated ? 'generated' : 'custom';
    document.getElementById('art-source-help').textContent = sources.generated
      ? 'Alterne sem gerar novamente. Cada versão mantém seus ajustes de enquadramento.'
      : 'Esta carta ainda não tem arte por IA. Para criá-la, importe com “Estender arte com IA local” ativado.';

    // Type buttons
    typeBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.type === card.type);
    });

    // Sphere buttons
    sphereBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.sphere === (card.sphere || SPHERES.LEADERSHIP));
    });

    // Control Visibility based on Type
    const isHero = card.type === CARD_TYPES.HERO;
    const isAlly = card.type === CARD_TYPES.ALLY;
    const isPlayer = card.type === CARD_TYPES.ATTACHMENT || card.type === CARD_TYPES.EVENT || isHero || isAlly || card.type === CARD_TYPES.TREASURE;
    const isEnemy = card.type === CARD_TYPES.ENEMY;
    const isLocation = card.type === CARD_TYPES.LOCATION;
    const isTreachery = card.type === CARD_TYPES.TREACHERY;
    const isObjective = card.type === CARD_TYPES.OBJECTIVE;
    const isTreasure = card.type === CARD_TYPES.TREASURE;
    const isQuest = card.type === CARD_TYPES.QUEST;

    // Landscape Mode for Quests
    cardWrapper.classList.toggle('landscape', isQuest);
    canvas.classList.toggle('landscape', isQuest);
    if (canvasDimBadge) {
      canvasDimBadge.textContent = isQuest ? '1063 × 756 px (300 DPI)' : '756 × 1063 px (300 DPI)';
    }
    if (btnFlipQuest) {
      btnFlipQuest.classList.toggle('hidden', !isQuest);
    }

    playerControls.classList.toggle('hidden', !(isHero || isAlly || card.type === CARD_TYPES.ATTACHMENT || card.type === CARD_TYPES.EVENT));
    heroStatsRow.classList.toggle('hidden', !(isHero || isAlly));
    if (heroBannerContainer) heroBannerContainer.classList.toggle('hidden', !isHero);
    if (threatCostCol) threatCostCol.classList.toggle('hidden', !isHero);
    costRow.classList.toggle('hidden', isHero);

    enemyControls.classList.toggle('hidden', !isEnemy);
    encounterControls.classList.toggle('hidden', !(isEnemy || isLocation || isTreachery || isObjective || isTreasure || isQuest));
    locationStatsRow.classList.toggle('hidden', !isLocation);
    if (scenarioNameContainer) scenarioNameContainer.classList.toggle('hidden', !isObjective);
    shadowToggleContainer.classList.toggle('hidden', !(isEnemy || isLocation || isTreachery));
    uniqueToggleContainer.classList.toggle('hidden', !(card.type === CARD_TYPES.ATTACHMENT || isHero || isAlly || isTreasure || isObjective));
    questControls.classList.toggle('hidden', !isQuest);
    if (questBStatsRow) questBStatsRow.classList.toggle('hidden', !isQuest || card.questSide !== 'b');

    shadowTextGroup.classList.toggle('hidden', !(isEnemy || isLocation || isTreachery));
    quoteTextGroup.classList.toggle('hidden', false);

    // Form inputs
    inputCost.value = card.cost !== undefined ? card.cost : '1';
    inputUnique.checked = !!card.isUnique;
    
    // Hero Stats
    inputThreatCost.value = card.threatCost !== undefined ? card.threatCost : '10';
    inputHeroWillpower.value = card.willpower !== undefined ? card.willpower : '2';
    inputHeroAttack.value = card.attack !== undefined ? card.attack : '2';
    inputHeroDefense.value = card.defense !== undefined ? card.defense : '2';
    inputHeroHealth.value = card.health !== undefined ? card.health : '4';
    if (inputHeroBanner) inputHeroBanner.value = card.heroBannerText || (isHero ? 'HERÓI' : '');

    // Enemy Stats
    inputEngagementThreat.value = card.engagementThreat !== undefined ? card.engagementThreat : '30';
    inputEnemyThreat.value = card.threat !== undefined ? card.threat : '2';
    inputEnemyAttack.value = card.attack !== undefined ? card.attack : '2';
    inputEnemyDefense.value = card.defense !== undefined ? card.defense : '2';
    inputEnemyHealth.value = card.health !== undefined ? card.health : '3';

    // Encounter / Location Stats
    inputThreat.value = card.threat !== undefined ? card.threat : '2';
    inputQuestPoints.value = card.questPoints !== undefined ? card.questPoints : '2';
    inputVictory.value = card.victory || '';
    if (inputScenarioName) inputScenarioName.value = card.scenarioName || '';
    if (card.encounterSet) selectEncounterSet.value = card.encounterSet;
    inputCardNumber.value = card.cardNumber || '1/15';
    inputHasShadow.checked = card.hasShadow !== false;

    // Quest fields
    if (inputQuestStage) inputQuestStage.value = card.stage || '1';
    inputQuestLetter.value = (card.questLetter || card.questSide || 'a').toUpperCase();
    if (inputStageTitle) inputStageTitle.value = card.stageTitle || card.name || '';
    if (inputQuestScenarioName) inputQuestScenarioName.value = card.scenarioName || '';
    if (inputQuestPointsSideB) inputQuestPointsSideB.value = card.questPoints !== undefined ? card.questPoints : '8';
    if (inputQuestVictory) inputQuestVictory.value = card.victory || '';
    if (inputQuestSide) inputQuestSide.value = card.questSide || 'a';
    questSideBtns.forEach(b => b.classList.toggle('active', b.dataset.side === (card.questSide || 'a')));

    inputName.value = card.name || '';
    inputTraits.value = card.traits || '';
    inputAbility.value = card.ability || '';
    inputShadow.value = card.shadowText || '';
    inputQuote.value = card.quote || '';
    inputIllustrator.value = card.illustrator || '';
    inputCopyright.value = card.copyright || '';

    // Art controls
    const isQuestCard = card.type === CARD_TYPES.QUEST;
    const defaultX = isQuestCard ? 3 : 0;
    const defaultY = isQuestCard ? 12 : 0;
    const defaultScale = isQuestCard ? 1.13 : 1.0;

    const art = card.art || {};
    const scaleXVal = art.scaleX !== undefined ? art.scaleX : (art.zoom !== undefined ? art.zoom : defaultScale);
    const scaleYVal = art.scaleY !== undefined ? art.scaleY : (art.zoom !== undefined ? art.zoom : defaultScale);
    const isLocked = art.lockRatio !== undefined ? !!art.lockRatio : true;
    const posXVal = art.posX !== undefined ? art.posX : defaultX;
    const posYVal = art.posY !== undefined ? art.posY : defaultY;

    if (sliderScaleX) sliderScaleX.value = scaleXVal;
    if (inputScaleXVal) inputScaleXVal.value = Math.round(scaleXVal * 100);

    if (sliderScaleY) sliderScaleY.value = scaleYVal;
    if (inputScaleYVal) inputScaleYVal.value = Math.round(scaleYVal * 100);

    if (btnToggleRatioLock) {
      btnToggleRatioLock.classList.toggle('locked', isLocked);
      if (ratioLockIcon) ratioLockIcon.textContent = isLocked ? '🔒' : '🔓';
      if (ratioLockText) ratioLockText.textContent = isLocked ? 'Travado (1:1)' : 'Livre (Individual)';
    }

    sliderPosX.value = posXVal;
    valPosX.textContent = posXVal + 'px';

    sliderPosY.value = posYVal;
    valPosY.textContent = posYVal + 'px';

    sliderRotation.value = art.rotation || 0;
    valRotation.textContent = (art.rotation || 0) + '°';

    if (sliderBottomFade && valBottomFade) {
      sliderBottomFade.value = art.bottomFade || 0;
      valBottomFade.textContent = (art.bottomFade || 0) + '%';
    }

    if (sliderFeather && valFeather) {
      sliderFeather.value = art.feather || 0;
      valFeather.textContent = (art.feather || 0) + 'px';
    }

    sliderBrightness.value = art.brightness !== undefined ? art.brightness : 1.0;
    valBrightness.textContent = Math.round((art.brightness !== undefined ? art.brightness : 1.0) * 100) + '%';

    sliderContrast.value = art.contrast !== undefined ? art.contrast : 1.0;
    valContrast.textContent = Math.round((art.contrast !== undefined ? art.contrast : 1.0) * 100) + '%';

    // Sync Stat Offsets
    const off = card.offsets || {};
    document.querySelectorAll('[data-quest-icon-offset]').forEach(input => {
      input.value = off[input.dataset.questIconOffset] || 0;
      input.closest('.offset-card').style.display = card.type === CARD_TYPES.QUEST ? '' : 'none';
    });
    if (offsetHealthX) offsetHealthX.value = off.healthX || 0;
    if (offsetHealthY) offsetHealthY.value = off.healthY || 0;
    if (offsetCostX) offsetCostX.value = off.costX !== undefined ? off.costX : (off.threatCostX || 0);
    if (offsetCostY) offsetCostY.value = off.costY !== undefined ? off.costY : (off.threatCostY || 0);
    if (offsetWillpowerX) offsetWillpowerX.value = off.willpowerX || 0;
    if (offsetWillpowerY) offsetWillpowerY.value = off.willpowerY || 0;
    if (offsetAttackX) offsetAttackX.value = off.attackX || 0;
    if (offsetAttackY) offsetAttackY.value = off.attackY || 0;
    if (offsetDefenseX) offsetDefenseX.value = off.defenseX || 0;
    if (offsetDefenseY) offsetDefenseY.value = off.defenseY || 0;
    if (offsetQuestPointsX) offsetQuestPointsX.value = off.questPointsX || 0;
    if (offsetQuestPointsY) offsetQuestPointsY.value = off.questPointsY || 0;
    if (offsetTypeX) offsetTypeX.value = off.typeX !== undefined ? off.typeX : (off.traitsX || 0);
    if (offsetTypeY) offsetTypeY.value = off.typeY !== undefined ? off.typeY : (off.traitsY || 0);
    if (offsetHeroTypeX) offsetHeroTypeX.value = off.heroTypeX || 0;
    if (offsetHeroTypeY) offsetHeroTypeY.value = off.heroTypeY || 0;
    if (offsetNameX) offsetNameX.value = off.nameX || 0;
    if (offsetNameY) offsetNameY.value = off.nameY || 0;
    if (offsetFlavorTextX) offsetFlavorTextX.value = off.flavorTextX || 0;
    if (offsetFlavorTextY) offsetFlavorTextY.value = off.flavorTextY || 0;

    deckCountBadge.textContent = cardState.getTotalDeckCount();
  }

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const prevType = cardState.currentCard.type;
      cardState.updateField('type', type);
      if (!cardState.currentCard.customArt) {
        if (type === CARD_TYPES.QUEST) {
          const side = (cardState.currentCard.questSide || 'a').toLowerCase();
          cardState.updateField('artSample', `/assets/sample_art/sample_quest_1${side}.jpg`);
        } else {
          cardState.updateField('artSample', `/assets/sample_art/sample_${type}.png`);
        }
      }
      if (type === CARD_TYPES.QUEST && prevType !== CARD_TYPES.QUEST) {
        if (!cardState.currentCard.art || (cardState.currentCard.art.posX === 0 && cardState.currentCard.art.posY === 0)) {
          cardState.updateArt({ ...DEFAULT_QUEST_ART_CONFIG });
        }
      }
      if (prevType !== type) cardState.applyCurrentLayout();
      syncFormWithState();
    });
  });

  sphereBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cardState.updateField('sphere', btn.dataset.sphere);
      syncFormWithState();
    });
  });

  inputUnique.addEventListener('change', (e) => cardState.updateField('isUnique', e.target.checked));
  inputCost.addEventListener('input', (e) => cardState.updateField('cost', e.target.value));

  // Hero input listeners
  inputThreatCost.addEventListener('input', (e) => cardState.updateField('threatCost', e.target.value));
  inputHeroWillpower.addEventListener('input', (e) => cardState.updateField('willpower', e.target.value));
  inputHeroAttack.addEventListener('input', (e) => cardState.updateField('attack', e.target.value));
  inputHeroDefense.addEventListener('input', (e) => cardState.updateField('defense', e.target.value));
  inputHeroHealth.addEventListener('input', (e) => cardState.updateField('health', e.target.value));
  if (inputHeroBanner) inputHeroBanner.addEventListener('input', (e) => cardState.updateField('heroBannerText', e.target.value));

  // Enemy input listeners
  inputEngagementThreat.addEventListener('input', (e) => cardState.updateField('engagementThreat', e.target.value));
  inputEnemyThreat.addEventListener('input', (e) => cardState.updateField('threat', e.target.value));
  inputEnemyAttack.addEventListener('input', (e) => cardState.updateField('attack', e.target.value));
  inputEnemyDefense.addEventListener('input', (e) => cardState.updateField('defense', e.target.value));
  inputEnemyHealth.addEventListener('input', (e) => cardState.updateField('health', e.target.value));

  // Encounter / Location input listeners
  inputThreat.addEventListener('input', (e) => cardState.updateField('threat', e.target.value));
  inputQuestPoints.addEventListener('input', (e) => cardState.updateField('questPoints', e.target.value));
  inputVictory.addEventListener('input', (e) => cardState.updateField('victory', e.target.value));
  if (inputScenarioName) inputScenarioName.addEventListener('input', (e) => cardState.updateField('scenarioName', e.target.value));
  selectEncounterSet.addEventListener('change', (e) => cardState.updateField('encounterSet', e.target.value));
  inputCardNumber.addEventListener('input', (e) => cardState.updateField('cardNumber', e.target.value));
  inputHasShadow.addEventListener('change', (e) => cardState.updateField('hasShadow', e.target.checked));

  // Quest listeners
  if (btnFlipQuest) {
    btnFlipQuest.addEventListener('click', () => {
      const curSide = cardState.currentCard.questSide || 'a';
      const newSide = curSide === 'a' ? 'b' : 'a';
      cardState.updateField('questSide', newSide);
      syncFormWithState();
    });
  }

  questSideBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cardState.updateField('questSide', btn.dataset.side);
      syncFormWithState();
    });
  });

  if (inputQuestStage) {
    inputQuestStage.addEventListener('input', (e) => cardState.updateField('stage', e.target.value));
  }
  if (inputStageTitle) {
    inputStageTitle.addEventListener('input', (e) => {
      cardState.updateField('stageTitle', e.target.value);
      cardState.updateField('name', e.target.value);
    });
  }
  if (inputQuestScenarioName) {
    inputQuestScenarioName.addEventListener('input', (e) => cardState.updateField('scenarioName', e.target.value));
  }
  if (inputQuestPointsSideB) {
    inputQuestPointsSideB.addEventListener('input', (e) => cardState.updateField('questPoints', e.target.value));
  }
  if (inputQuestVictory) {
    inputQuestVictory.addEventListener('input', (e) => cardState.updateField('victory', e.target.value));
  }
  if (inputQuestSide) {
    inputQuestSide.addEventListener('change', (e) => {
      cardState.updateField('questSide', e.target.value);
      syncFormWithState();
    });
  }

  inputName.addEventListener('input', (e) => cardState.updateField('name', e.target.value));
  inputTraits.addEventListener('input', (e) => cardState.updateField('traits', e.target.value));
  inputAbility.addEventListener('input', (e) => cardState.updateField('ability', e.target.value));
  inputShadow.addEventListener('input', (e) => cardState.updateField('shadowText', e.target.value));
  inputQuote.addEventListener('input', (e) => cardState.updateField('quote', e.target.value));
  inputIllustrator.addEventListener('input', (e) => cardState.updateField('illustrator', e.target.value));
  inputCopyright.addEventListener('input', (e) => cardState.updateField('copyright', e.target.value));

  // Offset Inputs Listeners
  const bindOffsetInput = (inputElem, key) => {
    if (!inputElem) return;
    inputElem.addEventListener('input', (e) => {
      cardState.updateOffset(key, e.target.value);
    });
  };

  bindOffsetInput(offsetHealthX, 'healthX');
  bindOffsetInput(offsetHealthY, 'healthY');
  bindOffsetInput(offsetCostX, 'costX');
  bindOffsetInput(offsetCostY, 'costY');
  bindOffsetInput(offsetWillpowerX, 'willpowerX');
  bindOffsetInput(offsetWillpowerY, 'willpowerY');
  bindOffsetInput(offsetAttackX, 'attackX');
  bindOffsetInput(offsetAttackY, 'attackY');
  bindOffsetInput(offsetDefenseX, 'defenseX');
  bindOffsetInput(offsetDefenseY, 'defenseY');
  bindOffsetInput(offsetQuestPointsX, 'questPointsX');
  bindOffsetInput(offsetQuestPointsY, 'questPointsY');
  bindOffsetInput(offsetTypeX, 'typeX');
  bindOffsetInput(offsetTypeY, 'typeY');
  bindOffsetInput(offsetHeroTypeX, 'heroTypeX');
  bindOffsetInput(offsetHeroTypeY, 'heroTypeY');
  bindOffsetInput(offsetNameX, 'nameX');
  bindOffsetInput(offsetNameY, 'nameY');
  bindOffsetInput(offsetFlavorTextX, 'flavorTextX');
  bindOffsetInput(offsetFlavorTextY, 'flavorTextY');
  document.querySelectorAll('[data-quest-icon-offset]').forEach(input => {
    bindOffsetInput(input, input.dataset.questIconOffset);
  });

  if (btnResetOffsets) {
    btnResetOffsets.addEventListener('click', () => {
      cardState.resetOffsets();
      syncFormWithState();
    });
  }

  // Art Dimension & Scale Controls (Independent Width and Height)
  function setArtScaleX(val) {
    const clamped = Math.max(0.2, Math.min(3.5, Math.round(val * 100) / 100));
    if (sliderScaleX) sliderScaleX.value = clamped;
    if (inputScaleXVal) inputScaleXVal.value = Math.round(clamped * 100);
    const updates = { scaleX: clamped };
    if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
      updates.scaleY = clamped;
      updates.zoom = clamped;
      if (sliderScaleY) sliderScaleY.value = clamped;
      if (inputScaleYVal) inputScaleYVal.value = Math.round(clamped * 100);
    }
    cardState.updateArt(updates);
  }

  function setArtScaleY(val) {
    const clamped = Math.max(0.2, Math.min(3.5, Math.round(val * 100) / 100));
    if (sliderScaleY) sliderScaleY.value = clamped;
    if (inputScaleYVal) inputScaleYVal.value = Math.round(clamped * 100);
    const updates = { scaleY: clamped };
    if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
      updates.scaleX = clamped;
      updates.zoom = clamped;
      if (sliderScaleX) sliderScaleX.value = clamped;
      if (inputScaleXVal) inputScaleXVal.value = Math.round(clamped * 100);
    }
    cardState.updateArt(updates);
  }

  if (sliderScaleX) {
    sliderScaleX.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (inputScaleXVal) inputScaleXVal.value = Math.round(val * 100);
      const updates = { scaleX: val };
      if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
        updates.scaleY = val;
        updates.zoom = val;
        if (sliderScaleY) sliderScaleY.value = val;
        if (inputScaleYVal) inputScaleYVal.value = Math.round(val * 100);
      }
      cardState.updateArt(updates);
    });
  }

  if (inputScaleXVal) {
    inputScaleXVal.addEventListener('input', (e) => {
      const num = parseFloat(e.target.value);
      if (!isNaN(num) && num > 0) {
        const s = Math.max(0.2, Math.min(3.5, Math.round((num / 100) * 100) / 100));
        if (sliderScaleX) sliderScaleX.value = s;
        const updates = { scaleX: s };
        if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
          updates.scaleY = s;
          updates.zoom = s;
          if (sliderScaleY) sliderScaleY.value = s;
          if (inputScaleYVal) inputScaleYVal.value = Math.round(s * 100);
        }
        cardState.updateArt(updates);
      }
    });

    inputScaleXVal.addEventListener('change', (e) => {
      let num = parseFloat(e.target.value);
      if (isNaN(num) || num < 20) num = 20;
      if (num > 350) num = 350;
      setArtScaleX(num / 100);
    });
  }

  if (btnScaleXMinus) {
    btnScaleXMinus.addEventListener('click', () => {
      const cur = parseFloat(sliderScaleX.value) || 1.0;
      setArtScaleX(cur - 0.05);
    });
  }

  if (btnScaleXPlus) {
    btnScaleXPlus.addEventListener('click', () => {
      const cur = parseFloat(sliderScaleX.value) || 1.0;
      setArtScaleX(cur + 0.05);
    });
  }

  if (sliderScaleY) {
    sliderScaleY.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (inputScaleYVal) inputScaleYVal.value = Math.round(val * 100);
      const updates = { scaleY: val };
      if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
        updates.scaleX = val;
        updates.zoom = val;
        if (sliderScaleX) sliderScaleX.value = val;
        if (inputScaleXVal) inputScaleXVal.value = Math.round(val * 100);
      }
      cardState.updateArt(updates);
    });
  }

  if (inputScaleYVal) {
    inputScaleYVal.addEventListener('input', (e) => {
      const num = parseFloat(e.target.value);
      if (!isNaN(num) && num > 0) {
        const s = Math.max(0.2, Math.min(3.5, Math.round((num / 100) * 100) / 100));
        if (sliderScaleY) sliderScaleY.value = s;
        const updates = { scaleY: s };
        if (cardState.currentCard.art && cardState.currentCard.art.lockRatio) {
          updates.scaleX = s;
          updates.zoom = s;
          if (sliderScaleX) sliderScaleX.value = s;
          if (inputScaleXVal) inputScaleXVal.value = Math.round(s * 100);
        }
        cardState.updateArt(updates);
      }
    });

    inputScaleYVal.addEventListener('change', (e) => {
      let num = parseFloat(e.target.value);
      if (isNaN(num) || num < 20) num = 20;
      if (num > 350) num = 350;
      setArtScaleY(num / 100);
    });
  }

  if (btnScaleYMinus) {
    btnScaleYMinus.addEventListener('click', () => {
      const cur = parseFloat(sliderScaleY.value) || 1.0;
      setArtScaleY(cur - 0.05);
    });
  }

  if (btnScaleYPlus) {
    btnScaleYPlus.addEventListener('click', () => {
      const cur = parseFloat(sliderScaleY.value) || 1.0;
      setArtScaleY(cur + 0.05);
    });
  }

  if (btnToggleRatioLock) {
    btnToggleRatioLock.addEventListener('click', () => {
      const currentlyLocked = !(cardState.currentCard.art && cardState.currentCard.art.lockRatio);
      cardState.updateArt({ lockRatio: currentlyLocked });
      syncFormWithState();
    });
  }

  if (btnEqualizeScale) {
    btnEqualizeScale.addEventListener('click', () => {
      const curX = (cardState.currentCard.art && cardState.currentCard.art.scaleX) || (cardState.currentCard.art && cardState.currentCard.art.zoom) || 1.29;
      setArtScaleX(curX);
      setArtScaleY(curX);
      cardState.updateArt({ scaleX: curX, scaleY: curX, zoom: curX });
      syncFormWithState();
    });
  }

  quickZoomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const z = parseFloat(btn.dataset.zoom) || 1.0;
      setArtScaleX(z);
      setArtScaleY(z);
      cardState.updateArt({ zoom: z, scaleX: z, scaleY: z });
      syncFormWithState();
    });
  });

  sliderPosX.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    valPosX.textContent = val + 'px';
    cardState.updateArt({ posX: val });
  });

  sliderPosY.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    valPosY.textContent = val + 'px';
    cardState.updateArt({ posY: val });
  });

  sliderRotation.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    valRotation.textContent = val + '°';
    cardState.updateArt({ rotation: val });
  });

  sliderBrightness.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valBrightness.textContent = Math.round(val * 100) + '%';
    cardState.updateArt({ brightness: val });
  });

  sliderContrast.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valContrast.textContent = Math.round(val * 100) + '%';
    cardState.updateArt({ contrast: val });
  });

  if (sliderBottomFade) {
    sliderBottomFade.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      valBottomFade.textContent = val + '%';
      cardState.updateArt({ bottomFade: val });
    });
  }

  if (sliderFeather) {
    sliderFeather.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      valFeather.textContent = val + 'px';
      cardState.updateArt({ feather: val });
    });
  }

  if (btnFrameQuestTopRight) {
    btnFrameQuestTopRight.addEventListener('click', () => {
      cardState.updateArt({ posX: 140, posY: -130, scaleX: 1.15, scaleY: 1.15, zoom: 1.15, bottomFade: 35, feather: 0 });
      syncFormWithState();
    });
  }

  if (btnFrameQuestCenter) {
    btnFrameQuestCenter.addEventListener('click', () => {
      cardState.updateArt({ posX: 3, posY: 12, scaleX: 1.13, scaleY: 1.16, zoom: 1.13, feather: 40, bottomFade: 0, brightness: 1.0, contrast: 0.9 });
      syncFormWithState();
    });
  }

  if (btnFrameFit) {
    btnFrameFit.addEventListener('click', () => {
      cardState.updateArt({ posX: 0, posY: 0, scaleX: 1.0, scaleY: 1.0, zoom: 1.0, rotation: 0, bottomFade: 0, feather: 0 });
      syncFormWithState();
    });
  }

  if (btnSyncArtSides) {
    btnSyncArtSides.addEventListener('click', () => {
      const curArt = JSON.parse(JSON.stringify(cardState.currentCard.art || {}));
      const curArtSample = cardState.currentCard.artSample;
      const curCustomArt = cardState.currentCard.customArt;
      const curMaskStrokes = JSON.parse(JSON.stringify(cardState.currentCard.artMaskStrokes || []));

      if (cardState.currentCard.type === CARD_TYPES.QUEST) {
        const otherSide = (cardState.currentCard.questSide || 'a') === 'a' ? 'b' : 'a';
        const otherSlot = otherSide === 'a' ? 'questArtA' : 'questArtB';
        cardState.currentCard[otherSlot] = {
          art: JSON.parse(JSON.stringify(curArt)),
          artSample: curArtSample,
          customArt: curCustomArt,
          artMaskStrokes: JSON.parse(JSON.stringify(curMaskStrokes))
        };
      }

      btnSyncArtSides.textContent = '✓ Arte Sincronizada!';
      setTimeout(() => {
        btnSyncArtSides.innerHTML = '🔗 Sincronizar Lados (A ↔ B)';
      }, 1500);
    });
  }

  btnResetArt.addEventListener('click', () => {
    cardState.resetArt();
    syncFormWithState();
  });
  inputProxyAlignment.addEventListener('change', () => {
    cardState.updateArt({ proxyAlignment: inputProxyAlignment.checked });
  });
  btnRestoreProxyFraming.addEventListener('click', () => {
    cardState.updateArt({ posX: 0, posY: 0, scaleX: 1, scaleY: 1, zoom: 1, rotation: 0, lockRatio: true, proxyAlignment: true });
    syncFormWithState();
  });

  btnUseSampleArt.addEventListener('click', () => {
    const type = cardState.currentCard.type || 'attachment';
    cardState.updateField('customArt', null);
    if (type === CARD_TYPES.QUEST) {
      const side = (cardState.currentCard.questSide || 'a').toLowerCase();
      cardState.updateField('artSample', `/assets/sample_art/sample_quest_1${side}.jpg`);
    } else {
      cardState.updateField('artSample', `/assets/sample_art/sample_${type}.png`);
    }
    cardState.resetArt();
    syncFormWithState();
  });

  // Art Dropzone & File Upload
  function handleArtFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      cardState.updateArt({ sourceKind: 'art' });
      cardState.updateField('customArt', e.target.result);
      if (!cardState.currentCard.art || (cardState.currentCard.art.posX === undefined)) {
        cardState.resetArt();
      } else {
        cardState.notify('art');
      }
      syncFormWithState();
    };
    reader.readAsDataURL(file);
  }

  inputArtFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleArtFile(e.target.files[0]);
    }
  });

  artDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    artDropzone.classList.add('dragover');
  });

  artDropzone.addEventListener('dragleave', () => {
    artDropzone.classList.remove('dragover');
  });

  artDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    artDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleArtFile(e.dataTransfer.files[0]);
    }
  });

  // 7. Interactive Art Tools: Direct Move Drag & Eraser Brush
  let currentInteractionMode = 'move'; // 'move' | 'eraser'
  let eraserBrushSize = 40;
  let isDragging = false;
  let isErasing = false;
  let startX = 0;
  let startY = 0;
  let initialArtX = 0;
  let initialArtY = 0;
  let currentEraserStroke = null;

  if (btnModeMove && btnModeEraser) {
    btnModeMove.addEventListener('click', () => {
      currentInteractionMode = 'move';
      btnModeMove.classList.add('active');
      btnModeEraser.classList.remove('active');
      if (eraserToolBox) eraserToolBox.classList.add('hidden');
      if (dragOverlay) dragOverlay.classList.remove('eraser-mode');
      if (eraserCursorPreview) eraserCursorPreview.style.display = 'none';
    });

    btnModeEraser.addEventListener('click', () => {
      currentInteractionMode = 'eraser';
      btnModeEraser.classList.add('active');
      btnModeMove.classList.remove('active');
      if (eraserToolBox) eraserToolBox.classList.remove('hidden');
      if (dragOverlay) dragOverlay.classList.add('eraser-mode');
    });
  }

  if (sliderEraserSize) {
    sliderEraserSize.addEventListener('input', (e) => {
      eraserBrushSize = parseInt(e.target.value, 10) || 40;
      if (valEraserSize) valEraserSize.textContent = eraserBrushSize + 'px';
    });
  }

  if (btnEraserUndo) {
    btnEraserUndo.addEventListener('click', () => {
      cardState.undoArtMaskStroke();
    });
  }

  if (btnEraserClear) {
    btnEraserClear.addEventListener('click', () => {
      cardState.clearArtMaskStrokes();
    });
  }

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
      visualScale: rect.width / canvas.width
    };
  }

  dragOverlay.addEventListener('mousedown', (e) => {
    if (currentInteractionMode === 'move') {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const defX = cardState.currentCard.type === CARD_TYPES.QUEST ? 3 : 0;
      const defY = cardState.currentCard.type === CARD_TYPES.QUEST ? 12 : 0;
      initialArtX = (cardState.currentCard.art && cardState.currentCard.art.posX) !== undefined ? cardState.currentCard.art.posX : defX;
      initialArtY = (cardState.currentCard.art && cardState.currentCard.art.posY) !== undefined ? cardState.currentCard.art.posY : defY;
      e.preventDefault();
    } else if (currentInteractionMode === 'eraser') {
      isErasing = true;
      const coords = getCanvasCoords(e);
      currentEraserStroke = {
        size: eraserBrushSize,
        points: [{ x: coords.x, y: coords.y }]
      };
      if (!cardState.currentCard.artMaskStrokes) {
        cardState.currentCard.artMaskStrokes = [];
      }
      cardState.currentCard.artMaskStrokes.push(currentEraserStroke);
      renderer.render(cardState.currentCard);
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    // Update eraser cursor preview circle
    if (currentInteractionMode === 'eraser' && eraserCursorPreview && cardWrapper) {
      const rect = cardWrapper.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const visualScale = rect.width / canvas.width;
        const visualSize = Math.max(8, eraserBrushSize * visualScale);
        eraserCursorPreview.style.display = 'block';
        eraserCursorPreview.style.width = `${visualSize}px`;
        eraserCursorPreview.style.height = `${visualSize}px`;
        eraserCursorPreview.style.left = `${e.clientX - rect.left}px`;
        eraserCursorPreview.style.top = `${e.clientY - rect.top}px`;
      } else {
        eraserCursorPreview.style.display = 'none';
      }
    }

    if (isDragging && currentInteractionMode === 'move') {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dx = (e.clientX - startX) * scaleX;
      const dy = (e.clientY - startY) * scaleY;
      const newX = Math.round(initialArtX + dx);
      const newY = Math.round(initialArtY + dy);
      cardState.updateArt({ posX: newX, posY: newY });
      sliderPosX.value = newX;
      valPosX.textContent = newX + 'px';
      sliderPosY.value = newY;
      valPosY.textContent = newY + 'px';
    } else if (isErasing && currentInteractionMode === 'eraser' && currentEraserStroke) {
      const coords = getCanvasCoords(e);
      currentEraserStroke.points.push({ x: coords.x, y: coords.y });
      renderer.render(cardState.currentCard);
    }
  });

  // Smooth Wheel Zoom directly on canvas preview
  dragOverlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const curX = (cardState.currentCard.art && cardState.currentCard.art.scaleX) !== undefined ? cardState.currentCard.art.scaleX : ((cardState.currentCard.art && cardState.currentCard.art.zoom) || 1.29);
    const curY = (cardState.currentCard.art && cardState.currentCard.art.scaleY) !== undefined ? cardState.currentCard.art.scaleY : ((cardState.currentCard.art && cardState.currentCard.art.zoom) || 1.29);
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const newX = Math.max(0.2, Math.min(3.5, Math.round((curX + delta) * 100) / 100));
    const newY = Math.max(0.2, Math.min(3.5, Math.round((curY + delta) * 100) / 100));
    setArtScaleX(newX);
    setArtScaleY(newY);
    cardState.updateArt({ scaleX: newX, scaleY: newY, zoom: newX });
    syncFormWithState();
  }, { passive: false });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
    }
    if (isErasing) {
      isErasing = false;
      currentEraserStroke = null;
      cardState.notify('art');
    }
  });

  dragOverlay.addEventListener('mouseleave', () => {
    if (eraserCursorPreview) {
      eraserCursorPreview.style.display = 'none';
    }
  });

  // 8. Zoom Controls on Preview
  zoomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      zoomBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scale = parseFloat(btn.dataset.scale);
      canvas.style.width = `${Math.round(756 * scale)}px`;
      canvas.style.height = `${Math.round(1063 * scale)}px`;
    });
  });

  // 9. Download PNG
  btnDownloadPng.addEventListener('click', () => {
    const cardName = (cardState.currentCard.name || 'card').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `lotr_${cardName}.png`;
    link.href = dataUrl;
    link.click();
  });

  // 10. Deck Management & Modal
  btnAddToDeck.addEventListener('click', () => {
    cardState.addToDeck();
    btnAddToDeck.textContent = '✓ Adicionado!';
    setTimeout(() => {
      btnAddToDeck.innerHTML = '<span class="icon">➕</span> Adicionar ao Deck';
    }, 1200);
  });

  let editingDeckItemId = null;

  btnSaveCard.addEventListener('click', async () => {
    const saved = cardState.saveCurrentToLibrary();
    if (editingDeckItemId) {
      cardState.updateDeckItemCard(editingDeckItemId, cardState.currentCard);
    }
    renderPresets();
    await cardState.flushStorage();
    if (cardState.storageError) return;
    btnSaveCard.innerHTML = '<span>✓</span> Carta Salva!';
    setTimeout(() => {
      btnSaveCard.innerHTML = '<span class="icon">💾</span> Salvar Carta';
    }, 1500);
  });

  btnOpenDeck.addEventListener('click', () => {
    renderDeckModal();
    modalDeck.classList.remove('hidden');
  });

  btnCloseDeck.addEventListener('click', () => {
    modalDeck.classList.add('hidden');
  });

  btnClearDeck.addEventListener('click', () => {
    if (confirm('Deseja realmente limpar todas as cartas do deck?')) {
      cardState.clearDeck();
      editingDeckItemId = null;
      renderDeckModal();
    }
  });

  function renderDeckModal() {
    deckGrid.innerHTML = '';
    const total = cardState.getTotalDeckCount();
    modalTotalCards.textContent = total;
    modalTotalPages.textContent = Math.ceil(total / 9);

    if (cardState.deck.length === 0) {
      deckGrid.innerHTML = '<p class="text-muted p-4">Nenhuma carta adicionada ao deck ainda. Adicione cartas no editor principal!</p>';
      return;
    }

    cardState.deck.forEach(item => {
      const card = item.card;
      const cardEl = document.createElement('div');
      cardEl.className = 'deck-card-item';
      const typeLabel = getCardTypeName(card.type).toUpperCase();
      const sphereLabel = getSphereName(card.sphere || card.encounterSet).toUpperCase();
      cardEl.innerHTML = `
        <div class="deck-card-info">
          <span class="deck-card-name">${card.name || 'Sem título'}</span>
          <span class="deck-card-type">${typeLabel} ${sphereLabel ? '• ' + sphereLabel : ''}</span>
        </div>
        <div class="deck-card-controls">
          <div class="qty-counter">
            <button type="button" class="btn-qty btn-minus">-</button>
            <span class="font-bold">${item.count}</span>
            <button type="button" class="btn-qty btn-plus">+</button>
          </div>
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn btn-secondary btn-sm btn-edit-deck" title="Editar no Gerador">✏️ Editar</button>
            <button type="button" class="btn btn-secondary btn-sm btn-del" title="Remover do Deck">🗑️</button>
          </div>
        </div>
      `;

      cardEl.querySelector('.btn-edit-deck').addEventListener('click', () => {
        editingDeckItemId = item.id;
        cardState.loadCard(card);
        syncFormWithState();
        modalDeck.classList.add('hidden');
      });

      cardEl.querySelector('.btn-minus').addEventListener('click', () => {
        if (item.count > 1) {
          cardState.updateDeckCount(item.id, item.count - 1);
        } else {
          cardState.removeFromDeck(item.id);
        }
        renderDeckModal();
      });

      cardEl.querySelector('.btn-plus').addEventListener('click', () => {
        cardState.updateDeckCount(item.id, item.count + 1);
        renderDeckModal();
      });

      cardEl.querySelector('.btn-del').addEventListener('click', () => {
        cardState.removeFromDeck(item.id);
        renderDeckModal();
      });

      deckGrid.appendChild(cardEl);
    });
  }

  // 11. PDF Exporter
  btnGeneratePdf.addEventListener('click', async () => {
    if (cardState.deck.length === 0) {
      alert('Adicione pelo menos 1 carta ao deck para gerar a folha de impressão!');
      return;
    }
    btnGeneratePdf.textContent = '⏳ Gerando PDF em 300 DPI...';
    btnGeneratePdf.disabled = true;

    try {
      await pdfExporter.generatePdf(cardState.deck, {
        pageSize: 'a4',
        cardsPerPage: 9,
        includeCutMarks: chkCutMarks.checked,
        highQuality: chkHighQuality.checked
      });
    } catch (e) {
      console.error('Error generating PDF:', e);
      alert('Ocorreu um erro ao gerar o PDF. Verifique o console.');
    } finally {
      btnGeneratePdf.textContent = '📄 Gerar PDF de Impressão (A4 Proxies)';
      btnGeneratePdf.disabled = false;
    }
  });

  // 11.1. Image Batch Exporter (ZIP)
  if (btnExportDeckImages) {
    btnExportDeckImages.addEventListener('click', async () => {
      if (cardState.deck.length === 0) {
        alert('Adicione pelo menos 1 carta ao deck para exportar as imagens!');
        return;
      }
      const originalText = btnExportDeckImages.innerHTML;
      btnExportDeckImages.disabled = true;
      btnExportDeckImages.innerHTML = '<span class="icon">⏳</span> Preparando ZIP...';

      try {
        const includeDuplicates = chkZipDuplicates ? chkZipDuplicates.checked : true;
        await imageExporter.exportDeckAsZip(cardState.deck, {
          includeDuplicates,
          zipFileName: `lotr_deck_cartas_${new Date().toISOString().slice(0, 10)}.zip`
        }, (prog) => {
          btnExportDeckImages.innerHTML = `<span class="icon">⏳</span> Renderizando ${prog.current}/${prog.total} (${prog.percentage}%)...`;
        });
      } catch (e) {
        console.error('Error exporting images ZIP:', e);
        alert(`Ocorreu um erro ao exportar as imagens: ${e.message}`);
      } finally {
        btnExportDeckImages.disabled = false;
        btnExportDeckImages.innerHTML = originalText;
      }
    });
  }

  const importScopeOptions = [...document.querySelectorAll('[data-import-scope]')];
  importScopeOptions.forEach(select => {
    select.value = localStorage.getItem('lotr_import_scope') === 'encounter-quest' ? 'encounter-quest' : 'all';
    select.addEventListener('change', () => {
      importScopeOptions.forEach(other => { other.value = select.value; });
      localStorage.setItem('lotr_import_scope', select.value);
    });
  });
  const aiImportOptions = [...document.querySelectorAll('[data-ai-import]')];
  for (const checkbox of aiImportOptions) {
    checkbox.checked = localStorage.getItem('lotr_ai_import') !== 'false';
    checkbox.addEventListener('change', () => {
      localStorage.setItem('lotr_ai_import', String(checkbox.checked));
      aiImportOptions.forEach(other => { other.checked = checkbox.checked; });
    });
  }
  async function prepareImportedArt(data, progress) {
    if (!aiImportOptions[0]?.checked) return;
    const result = await extendImportedCards(data.cards, async payload => {
      const response = await fetch('/api/extend-import-art', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw Error(json.error || 'Falha na IA local');
      return json;
    }, (count, name) => progress('Estendendo arte ' + count + ': ' + name + '…'));
    data.cards = result.cards;
    data.artWarnings = result.warnings;
    progress(result.warnings.length ? 'Arte original mantida em ' + result.warnings.length + ' imagem(ns): ' + result.warnings.join('; ') : 'Artes por IA prontas.');
  }

  // Quick Single Card Search from Tab 2
  async function handleQuickSingleCardImport() {
    if (!inputQuickSingleCard) return;
    const query = inputQuickSingleCard.value.trim();
    if (!query) {
      alert('Digite o nome da carta (ex: Aragorn, Feint, Steward of Gondor) ou cole a URL.');
      inputQuickSingleCard.focus();
      return;
    }

    const originalBtnText = btnQuickImportSingle ? btnQuickImportSingle.innerHTML : '<span>⚡</span> Buscar';
    if (btnQuickImportSingle) {
      btnQuickImportSingle.disabled = true;
      btnQuickImportSingle.innerHTML = '<span>⏳</span> Buscando...';
    }

    try {
      const resp = await fetch('/api/import-hall-of-beorn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: query, importScope: importScopeOptions[0].value })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${resp.status}`);
      }

      const data = await resp.json();
      if (!data.cards || data.cards.length === 0) {
        throw new Error(`Nenhuma carta encontrada para "${query}".`);
      }
      await prepareImportedArt(data, message => {
        const status = document.getElementById('quick-ai-status');
        if (status) status.textContent = message;
        if (btnQuickImportSingle) btnQuickImportSingle.textContent = 'Processando arte…';
      });
      data.cards = data.cards.map(card => cardState.withSavedLayout(card));

      if (data.cards.length === 1) {
        // Exactly 1 card found: load directly into the editor
        const card = data.cards[0];
        cardState.loadCard(card);
        syncFormWithState();
        inputQuickSingleCard.value = '';
        if (btnQuickImportSingle) {
          btnQuickImportSingle.innerHTML = '<span>✓</span> Carregada!';
          setTimeout(() => {
            btnQuickImportSingle.innerHTML = originalBtnText;
            btnQuickImportSingle.disabled = false;
          }, 1500);
        }
      } else {
        // Multiple matches (e.g. 5 versions of Aragorn): open modal with results
        inputHobUrl.value = query;
        modalImporter.classList.remove('hidden');
        importerStatusBox.classList.remove('hidden');
        importerProgressBar.style.width = '100%';
        importerStatusText.textContent = `Encontradas ${data.cards.length} versões para "${query}":`;
        importerCountBadge.textContent = `${data.cards.length} cartas`;
        
        importedCardsList = data.cards;
        selectedImportedIds = new Set(data.cards.map(c => c.id));
        importedExpansionTitle.textContent = `Resultados para "${query}" (${data.cards.length} versões):`;
        importedResultsHeader.classList.remove('hidden');
        renderImportedCardsGrid();

        if (btnQuickImportSingle) {
          btnQuickImportSingle.innerHTML = originalBtnText;
          btnQuickImportSingle.disabled = false;
        }
      }
    } catch (err) {
      console.error('Quick single card search error:', err);
      alert(`❌ Erro ao buscar carta: ${err.message}`);
      if (btnQuickImportSingle) {
        btnQuickImportSingle.innerHTML = originalBtnText;
        btnQuickImportSingle.disabled = false;
      }
    }
  }

  if (btnQuickImportSingle) {
    btnQuickImportSingle.addEventListener('click', handleQuickSingleCardImport);
  }
  if (inputQuickSingleCard) {
    inputQuickSingleCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickSingleCardImport();
      }
    });
  }

  // 12. Hall of Beorn Importer Logic
  btnOpenImporter.addEventListener('click', () => {
    modalImporter.classList.remove('hidden');
  });

  btnCloseImporter.addEventListener('click', () => {
    modalImporter.classList.add('hidden');
  });

  if (inputHobUrl) {
    inputHobUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerHallOfBeornImport();
      }
    });
  }

  quickExpBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      inputHobUrl.value = btn.dataset.url;
      triggerHallOfBeornImport();
    });
  });

  btnStartImport.addEventListener('click', () => {
    triggerHallOfBeornImport();
  });

  async function triggerHallOfBeornImport() {
    const url = inputHobUrl.value.trim();
    if (!url) {
      alert('Por favor, digite o nome de uma carta ou a URL no Hall of Beorn.');
      return;
    }

    btnStartImport.disabled = true;
    btnStartImport.innerHTML = '<span>⏳</span> Buscando...';
    importerStatusBox.classList.remove('hidden');
    importerStatusText.textContent = 'Conectando ao Hall of Beorn e buscando cartas...';
    importerCountBadge.textContent = 'Buscando...';
    importerProgressBar.style.width = '20%';
    importedResultsHeader.classList.add('hidden');
    importedCardsGrid.innerHTML = '';

    try {
      const resp = await fetch('/api/import-hall-of-beorn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, importScope: importScopeOptions[0].value })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${resp.status}`);
      }

      importerProgressBar.style.width = '70%';
      const data = await resp.json();
      await prepareImportedArt(data, message => { importerStatusText.textContent = message; });
      data.cards = data.cards.map(card => cardState.withSavedLayout(card));
      
      importerProgressBar.style.width = '100%';
      importerStatusText.textContent = `✓ Importação concluída: ${data.expansionName}`;
      if (data.warnings?.length) importerStatusText.textContent += ` — ${data.warnings.length} carta(s) não importada(s): ${data.warnings.map(w => w.error).join('; ')}`;
      if (data.artWarnings?.length) importerStatusText.textContent += ' — Arte original mantida: ' + data.artWarnings.join('; ');
      importerCountBadge.textContent = `${data.cards.length} cartas extraídas`;

      importedCardsList = data.cards;
      selectedImportedIds = new Set(data.cards.map(c => c.id));
      
      importedExpansionTitle.textContent = `${data.expansionName} (${data.cards.length} cartas):`;
      importedResultsHeader.classList.remove('hidden');

      renderImportedCardsGrid();
    } catch (err) {
      console.error('Import error:', err);
      importerStatusText.textContent = `❌ Erro ao importar: ${err.message}`;
      importerProgressBar.style.backgroundColor = '#dc2626';
    } finally {
      btnStartImport.disabled = false;
      btnStartImport.innerHTML = '<span>⚡</span> Buscar / Importar';
    }
  }

  function renderImportedCardsGrid() {
    importedCardsGrid.innerHTML = '';
    importedCardsList.forEach(card => {
      const isSelected = selectedImportedIds.has(card.id);
      const div = document.createElement('div');
      div.className = `imported-card-item ${isSelected ? 'selected' : ''}`;
      
      const sphereClass = card.sphere ? `badge-${String(card.sphere).toLowerCase()}` : 'badge-neutral';
      const sphereLabel = getSphereName(card.sphere || card.encounterSet);
      const typeLabel = getCardTypeName(card.type || card.rawType);

      div.innerHTML = `
        <div style="position: relative;">
          <img src="${card.customArt || '/assets/sample_art/sample_attachment.png'}" class="imported-card-thumb" alt="${card.name}" loading="lazy" />
          <input type="checkbox" class="chk-import-card" ${isSelected ? 'checked' : ''} style="position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; accent-color: var(--gold-primary);" />
        </div>
        <div class="imported-card-title">${card.name}</div>
        <div class="imported-card-meta">
          <span class="badge-sphere ${sphereClass}">${sphereLabel}</span>
          <span>${typeLabel}</span>
          <span>${Math.max(1, Number(card.quantity) || 1)} cópia(s)</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm btn-load-editor mt-1 w-full">Carregar no Editor</button>
      `;

      // Checkbox toggle
      const chk = div.querySelector('.chk-import-card');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedImportedIds.add(card.id);
          div.classList.add('selected');
        } else {
          selectedImportedIds.delete(card.id);
          div.classList.remove('selected');
        }
      });

      // Click to load into editor
      div.querySelector('.btn-load-editor').addEventListener('click', () => {
        cardState.loadCard(card);
        syncFormWithState();
        modalImporter.classList.add('hidden');
      });

      importedCardsGrid.appendChild(div);
    });
  }

  btnSelectAllImported.addEventListener('click', () => {
    if (selectedImportedIds.size === importedCardsList.length) {
      selectedImportedIds.clear();
    } else {
      selectedImportedIds = new Set(importedCardsList.map(c => c.id));
    }
    renderImportedCardsGrid();
  });

  if (btnExportImportedZip) {
    btnExportImportedZip.addEventListener('click', async () => {
      const toExport = importedCardsList.filter(c => selectedImportedIds.has(c.id));
      const targetCards = toExport.length > 0 ? toExport : importedCardsList;

      if (targetCards.length === 0) {
        alert('Nenhuma carta importada selecionada para exportar.');
        return;
      }

      const originalText = btnExportImportedZip.innerHTML;
      btnExportImportedZip.disabled = true;
      btnExportImportedZip.innerHTML = '<span class="icon">⏳</span> Gerando ZIP...';

      importerStatusBox.classList.remove('hidden');
      importerProgressBar.style.width = '0%';
      importerProgressBar.style.backgroundColor = 'var(--gold-primary)';
      importerStatusText.textContent = `Exportando 0/${targetCards.length} imagens PNG...`;

      try {
        const deckItems = targetCards.map(c => ({ id: c.id, card: c, count: c.quantity || 1 }));
        await imageExporter.exportDeckAsZip(deckItems, {
          includeDuplicates: false,
          zipFileName: `lotr_cartas_importadas_${new Date().toISOString().slice(0, 10)}.zip`
        }, (prog) => {
          importerProgressBar.style.width = `${prog.percentage}%`;
          importerStatusText.textContent = `Renderizando imagem ${prog.current}/${prog.total}: ${prog.cardName} (${prog.percentage}%)...`;
        });

        importerProgressBar.style.width = '100%';
        importerStatusText.textContent = `✓ ${targetCards.length} cartas exportadas como imagens em ZIP com sucesso!`;
      } catch (e) {
        console.error('Error exporting imported cards to ZIP:', e);
        importerStatusText.textContent = `❌ Erro ao exportar ZIP: ${e.message}`;
        importerProgressBar.style.backgroundColor = '#dc2626';
        alert(`Erro ao exportar imagens: ${e.message}`);
      } finally {
        btnExportImportedZip.disabled = false;
        btnExportImportedZip.innerHTML = originalText;
      }
    });
  }

  btnAddImportedToDeck.addEventListener('click', () => {
    const toAdd = importedCardsList.filter(c => selectedImportedIds.has(c.id));
    if (toAdd.length === 0) {
      alert('Selecione pelo menos 1 carta para adicionar ao deck.');
      return;
    }
    toAdd.forEach(card => cardState.addToDeck(card));
    alert(`${toAdd.length} cartas adicionadas ao Deck/Folha de Proxies!`);
  });

  btnSaveImportedToLib.addEventListener('click', () => {
    const toSave = importedCardsList.filter(c => selectedImportedIds.has(c.id));
    if (toSave.length === 0) {
      alert('Selecione pelo menos 1 carta para salvar na biblioteca.');
      return;
    }
    toSave.forEach(card => {
      const copy = JSON.parse(JSON.stringify(card));
      copy.id = 'saved-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
      cardState.savedCards.push(copy);
    });
    cardState.saveToStorage();
    renderPresets();
    alert(`${toSave.length} cartas salvas na sua biblioteca local com sucesso!`);
  });

  // 13. JSON Library Export/Import
  btnExportJson.addEventListener('click', () => {
    const data = {
      savedCards: cardState.savedCards,
      deck: cardState.deck,
      layoutPresets: cardState.layoutPresets,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lotr_cards_library_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  });

  btnImportJsonTrigger.addEventListener('click', () => inputImportJson.click());

  inputImportJson.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.layoutPresets && typeof imported.layoutPresets === 'object') {
          cardState.saveLayoutPresets({ ...cardState.layoutPresets, ...imported.layoutPresets });
          syncLayoutControls();
        }
        if (imported.savedCards && Array.isArray(imported.savedCards)) {
          cardState.savedCards = imported.savedCards;
        }
        if (imported.deck && Array.isArray(imported.deck)) {
          cardState.deck = imported.deck;
        }
        cardState.saveToStorage();
        renderPresets();
        renderDeckModal();
        alert('Biblioteca importada com sucesso!');
      } catch (err) {
        alert('Arquivo JSON inválido!');
      }
    };
    reader.readAsText(file);
  });

  // 14. Translation Settings & Execution Handlers
  function updateModelOptions(provider, selectedModel = null) {
    selectAiModel.innerHTML = '';
    if (provider === PROVIDERS.OPENAI) {
      const models = [...OPENAI_TRANSLATION_MODELS];
      // Keep previously saved model choices visible instead of silently
      // replacing them with a different model/cost tier.
      if (selectedModel && !models.some(m => m.id === selectedModel)) {
        models.push({ id: selectedModel, label: `${selectedModel} (configuração anterior)` });
      }
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === selectedModel) opt.selected = true;
        selectAiModel.appendChild(opt);
      });
      apiKeyHelp.innerHTML = 'Para OpenAI: Obtenha sua chave em <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--gold-primary); text-decoration: underline;">platform.openai.com/api-keys</a>.';
      inputApiKey.placeholder = 'sk-...';
    } else {
      const models = [
        { id: '', label: 'Automático (modelos disponíveis na sua conta)' }
      ];
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === selectedModel) opt.selected = true;
        selectAiModel.appendChild(opt);
      });
      apiKeyHelp.innerHTML = 'Para Google Gemini: Obtenha grátis em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--gold-primary); text-decoration: underline;">Google AI Studio</a>.';
      inputApiKey.placeholder = 'AIzaSy...';
    }
  }

  if (btnOpenTranslationSettings) {
    btnOpenTranslationSettings.addEventListener('click', () => {
      const settings = getTranslationSettings();
      if (settings.provider === PROVIDERS.OPENAI) {
        providerOpenai.checked = true;
      } else {
        providerGoogle.checked = true;
      }
      inputApiKey.value = settings.apiKey || '';
      updateModelOptions(settings.provider, settings.model);
      translationStatusMsg.classList.add('hidden');
      modalTranslationSettings.classList.remove('hidden');
    });
  }

  if (btnCloseTranslationSettings) {
    btnCloseTranslationSettings.addEventListener('click', () => {
      modalTranslationSettings.classList.add('hidden');
    });
  }

  if (providerGoogle) {
    providerGoogle.addEventListener('change', () => {
      if (providerGoogle.checked) updateModelOptions(PROVIDERS.GOOGLE);
    });
  }

  if (providerOpenai) {
    providerOpenai.addEventListener('change', () => {
      if (providerOpenai.checked) updateModelOptions(PROVIDERS.OPENAI);
    });
  }

  if (btnSaveTranslationSettings) {
    btnSaveTranslationSettings.addEventListener('click', () => {
      const provider = providerOpenai.checked ? PROVIDERS.OPENAI : PROVIDERS.GOOGLE;
      const apiKey = inputApiKey.value.trim();
      const model = selectAiModel.value;

      saveTranslationSettings({ provider, apiKey, model });

      translationStatusMsg.className = 'mt-3';
      translationStatusMsg.style.cssText = 'font-size: 12px; padding: 8px 12px; border-radius: 6px; background: rgba(22, 163, 74, 0.15); border: 1px solid #16a34a; color: #86efac;';
      translationStatusMsg.textContent = '✓ Configurações de tradução salvas com sucesso!';
      translationStatusMsg.classList.remove('hidden');

      setTimeout(() => {
        modalTranslationSettings.classList.add('hidden');
      }, 1200);
    });
  }

  if (btnTestTranslation) {
    btnTestTranslation.addEventListener('click', async () => {
      const provider = providerOpenai.checked ? PROVIDERS.OPENAI : PROVIDERS.GOOGLE;
      const apiKey = inputApiKey.value.trim();
      const model = selectAiModel.value;

      if (!apiKey) {
        alert('Por favor, informe a Chave de API antes de testar.');
        return;
      }

      btnTestTranslation.disabled = true;
      btnTestTranslation.textContent = '⏳ Testando...';
      translationStatusMsg.classList.add('hidden');

      try {
        const testCard = {
          id: 'test',
          name: 'Ranger of the North',
          traits: 'Dúnedain. Ranger.',
          ability: '<b>Response:</b> After you play Ranger of the North, choose 1 enemy in the staging area. Deal 1 damage to that enemy.'
        };

        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            apiKey,
            model,
            cards: [testCard]
          })
        });

        const resData = await resp.json();
        if (!resp.ok || !resData.success) {
          throw new Error(resData.error || 'Erro no teste de conexão.');
        }

        const trans = resData.cards[0];
        translationStatusMsg.className = 'mt-3';
        translationStatusMsg.style.cssText = 'font-size: 12px; padding: 8px 12px; border-radius: 6px; background: rgba(22, 163, 74, 0.15); border: 1px solid #16a34a; color: #86efac;';
        translationStatusMsg.innerHTML = `<strong>✓ Conexão bem-sucedida!</strong><br/>Exemplo: "<em>${trans.name}</em>" • <em>${trans.traits}</em>`;
        translationStatusMsg.classList.remove('hidden');
      } catch (err) {
        translationStatusMsg.className = 'mt-3';
        translationStatusMsg.style.cssText = 'font-size: 12px; padding: 8px 12px; border-radius: 6px; background: rgba(220, 38, 38, 0.15); border: 1px solid #dc2626; color: #fca5a5;';
        translationStatusMsg.textContent = `❌ Erro: ${err.message}`;
        translationStatusMsg.classList.remove('hidden');
      } finally {
        btnTestTranslation.disabled = false;
        btnTestTranslation.textContent = '🧪 Testar Conexão';
      }
    });
  }

  // Single Card Translation (Editor)
  if (btnTranslateCard) {
    btnTranslateCard.addEventListener('click', async () => {
      const settings = getTranslationSettings();
      if (!settings.apiKey) {
        btnOpenTranslationSettings.click();
        return;
      }

      const originalBtnText = btnTranslateCard.innerHTML;
      btnTranslateCard.disabled = true;
      btnTranslateCard.innerHTML = '<span class="icon">⏳</span> Traduzindo...';

      try {
        const translated = await translateSingleCard(cardState.currentCard);
        if (translated) {
          cardState.loadCard({ ...cardState.currentCard, ...translated });
          syncFormWithState();
        }
      } catch (err) {
        console.error('Single card translation error:', err);
        alert(`Erro na tradução: ${err.message}`);
      } finally {
        btnTranslateCard.disabled = false;
        btnTranslateCard.innerHTML = originalBtnText;
      }
    });
  }

  // Batch Translation (Hall of Beorn Importer)
  if (btnTranslateImported) {
    btnTranslateImported.addEventListener('click', async () => {
      const settings = getTranslationSettings();
      if (!settings.apiKey) {
        btnOpenTranslationSettings.click();
        return;
      }

      const toTranslate = importedCardsList.filter(c => selectedImportedIds.has(c.id));
      const targetCards = toTranslate.length > 0 ? toTranslate : importedCardsList;

      if (targetCards.length === 0) {
        alert('Nenhuma carta importada para traduzir.');
        return;
      }

      const originalBtnText = btnTranslateImported.innerHTML;
      btnTranslateImported.disabled = true;
      btnTranslateImported.innerHTML = '<span class="icon">⏳</span> Traduzindo...';

      importerStatusBox.classList.remove('hidden');
      importerProgressBar.style.width = '0%';
      importerProgressBar.style.backgroundColor = 'var(--gold-primary)';
      importerStatusText.textContent = `Traduzindo 0/${targetCards.length} cartas para PT-BR...`;

      try {
        const translatedList = await translateCardsBatch(targetCards, (prog) => {
          importerProgressBar.style.width = `${prog.percentage}%`;
          importerStatusText.textContent = `Traduzindo ${prog.current}/${prog.total} cartas para PT-BR (${prog.percentage}%)...`;
        });

        // Merge translated data back into importedCardsList
        translatedList.forEach(tCard => {
          const match = importedCardsList.find(c => c.id === tCard.id || c.name === tCard.id);
          if (match) {
            if (tCard.questSides) match.questSides = tCard.questSides;
            if (tCard.name) match.name = tCard.name;
            if (tCard.traits) match.traits = tCard.traits;
            if (tCard.ability) match.ability = tCard.ability;
            if (tCard.shadowText) match.shadowText = tCard.shadowText;
            if (tCard.quote) match.quote = tCard.quote;
            if (tCard.scenarioName) match.scenarioName = tCard.scenarioName;
            if (tCard.stageTitle) match.stageTitle = tCard.stageTitle;
            if (typeof tCard.victory === 'string') match.victory = tCard.victory;
            if (tCard.heroBannerText) match.heroBannerText = tCard.heroBannerText;
          }
        });

        importerProgressBar.style.width = '100%';
        importerStatusText.textContent = `✓ ${translatedList.length} cartas traduzidas com sucesso para PT-BR!`;
        renderImportedCardsGrid();
      } catch (err) {
        console.error('Batch translation error:', err);
        importerStatusText.textContent = `❌ Erro na tradução em lote: ${err.message}`;
        importerProgressBar.style.backgroundColor = '#dc2626';
        alert(`Erro ao traduzir em lote: ${err.message}`);
      } finally {
        btnTranslateImported.disabled = false;
        btnTranslateImported.innerHTML = originalBtnText;
      }
    });
  }

  // 15. Presets and Saved Library List Rendering
  function renderPresets() {
    if (!presetsList) return;
    presetsList.innerHTML = '';

    // Section 1: Saved Cards
    if (cardState.savedCards && cardState.savedCards.length > 0) {
      const headerSaved = document.createElement('div');
      headerSaved.style.cssText = 'font-weight: 700; color: var(--gold-light); font-size: 13px; margin-bottom: 6px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;';
      headerSaved.innerHTML = `<span>📚 Minhas Cartas Salvas (${cardState.savedCards.length})</span>`;
      presetsList.appendChild(headerSaved);

      cardState.savedCards.forEach(savedCard => {
        const item = document.createElement('div');
        item.className = 'preset-card-item';
        const typeLabel = getCardTypeName(savedCard.type).toUpperCase();
        const sphereLabel = getSphereName(savedCard.sphere || savedCard.encounterSet).toUpperCase();
        item.innerHTML = `
          <div class="preset-info">
            <span class="preset-title">${savedCard.name || 'Sem título'}</span>
            <span class="preset-meta">${typeLabel} • ${sphereLabel}</span>
          </div>
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn btn-secondary btn-xs btn-load-saved" title="Carregar no Editor">✏️</button>
            <button type="button" class="btn btn-secondary btn-xs btn-add-saved-deck" title="Adicionar ao Deck">➕</button>
            <button type="button" class="btn btn-secondary btn-xs btn-del-saved" title="Excluir da Biblioteca">🗑️</button>
          </div>
        `;

        item.querySelector('.btn-load-saved').addEventListener('click', () => {
          editingDeckItemId = null;
          cardState.loadCard(savedCard);
          syncFormWithState();
        });

        item.querySelector('.btn-add-saved-deck').addEventListener('click', () => {
          cardState.addToDeck(savedCard);
        });

        item.querySelector('.btn-del-saved').addEventListener('click', () => {
          if (confirm(`Deseja excluir a carta "${savedCard.name}" da biblioteca?`)) {
            cardState.deleteFromLibrary(savedCard.id);
            renderPresets();
          }
        });

        presetsList.appendChild(item);
      });
    }

    // Section 2: Default Presets
    const headerPresets = document.createElement('div');
    headerPresets.style.cssText = 'font-weight: 700; color: var(--text-secondary); font-size: 12px; margin-top: 14px; margin-bottom: 6px;';
    headerPresets.innerHTML = `<span>🌟 Modelos Padrão (Presets)</span>`;
    presetsList.appendChild(headerPresets);

    DEFAULT_PRESETS.forEach(preset => {
      const item = document.createElement('div');
      item.className = 'preset-card-item';
      const typeLabel = getCardTypeName(preset.type).toUpperCase();
      const sphereLabel = getSphereName(preset.sphere || preset.encounterSet).toUpperCase();
      item.innerHTML = `
        <div class="preset-info">
          <span class="preset-title">${preset.name}</span>
          <span class="preset-meta">${typeLabel} • ${sphereLabel}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-xs btn-load-preset">Carregar</button>
      `;

      item.querySelector('.btn-load-preset').addEventListener('click', () => {
        editingDeckItemId = null;
        cardState.loadCard(cardState.withSavedLayout(preset));
        syncFormWithState();
      });

      presetsList.appendChild(item);
    });
  }

  // 16. State Subscription -> Trigger Canvas Re-render & Sync
  cardState.subscribe((card, changeType) => {
    renderer.render(card);
    deckCountBadge.textContent = cardState.getTotalDeckCount();

    // If currently editing a deck item card live, keep deck item synced
    if (editingDeckItemId && changeType !== 'deck') {
      const dItem = cardState.deck.find(i => i.id === editingDeckItemId);
      if (dItem) {
        dItem.card = JSON.parse(JSON.stringify(card));
        cardState.saveToStorage();
      }
    }
  });

  // Initial Sync & Render
  syncFormWithState();
  renderPresets();
  await renderer.render(cardState.currentCard);
  console.log('LotR LCG Card Generator initialized successfully.');
});
